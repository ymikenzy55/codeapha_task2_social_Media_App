const express = require('express');
const multer = require('multer');
const path = require('path');
const { pool } = require('../db');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { broadcastToAdmins } = require('./events');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../frontend/uploads')),
  filename: (req, file, cb) => cb(null, `post_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|mkv|webm/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only images and videos are allowed'));
  }
});

router.get('/feed', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.avatar,
        EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=$1) AS liked
       FROM posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id IN (
         SELECT following_id FROM followers WHERE follower_id=$1
         UNION SELECT $1
       )
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/explore', optionalAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;

  try {
    let result;
    if (req.user) {
      result = await pool.query(
        `SELECT p.*, u.username, u.avatar,
          EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=$1) AS liked
         FROM posts p JOIN users u ON u.id = p.user_id
         WHERE u.is_active=true
         ORDER BY p.likes_count DESC, p.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
    } else {
      result = await pool.query(
        `SELECT p.*, u.username, u.avatar, false AS liked
         FROM posts p JOIN users u ON u.id = p.user_id
         WHERE u.is_active=true
         ORDER BY p.likes_count DESC, p.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, upload.single('media'), async (req, res) => {
  const { content } = req.body;
  if (!content && !req.file)
    return res.status(400).json({ error: 'Post must have content or media' });

  let media_url = null;
  let media_type = null;
  if (req.file) {
    media_url = `/uploads/${req.file.filename}`;
    media_type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_type)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [req.user.id, content || '', media_url, media_type]
    );
    const post = result.rows[0];
    const userResult = await pool.query('SELECT username, avatar FROM users WHERE id=$1', [req.user.id]);
    const fullPost = { ...post, ...userResult.rows[0], liked: false };
    // Notify admin dashboards of new post instantly
    broadcastToAdmins('new-post', { postId: post.id, username: userResult.rows[0].username, content: post.content?.slice(0, 60) });
    res.status(201).json(fullPost);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.avatar,
        EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=$1) AS liked
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.user_id=$2 ORDER BY p.created_at DESC`,
      [req.user.id, req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.avatar,
        EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=$1) AS liked
       FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.id=$2`,
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const post = await pool.query('SELECT user_id FROM posts WHERE id=$1', [req.params.id]);
    if (post.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    if (post.rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized' });

    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT id FROM likes WHERE post_id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM likes WHERE post_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count - 1 WHERE id=$1', [req.params.id]);
      const p = await pool.query('SELECT likes_count FROM posts WHERE id=$1', [req.params.id]);
      return res.json({ liked: false, likes_count: p.rows[0].likes_count });
    } else {
      await pool.query('INSERT INTO likes (post_id, user_id) VALUES ($1,$2)', [req.params.id, req.user.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count + 1 WHERE id=$1', [req.params.id]);
      const p = await pool.query('SELECT likes_count FROM posts WHERE id=$1', [req.params.id]);
      return res.json({ liked: true, likes_count: p.rows[0].likes_count });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/comments', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.username, u.avatar FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/comments', authenticate, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });

  try {
    const result = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
      [req.params.id, req.user.id, content]
    );
    await pool.query('UPDATE posts SET comments_count = comments_count + 1 WHERE id=$1', [req.params.id]);
    const userResult = await pool.query('SELECT username, avatar FROM users WHERE id=$1', [req.user.id]);
    res.status(201).json({ ...result.rows[0], ...userResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:postId/comments/:commentId', authenticate, async (req, res) => {
  try {
    const comment = await pool.query('SELECT user_id FROM comments WHERE id=$1', [req.params.commentId]);
    if (comment.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    if (comment.rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized' });

    await pool.query('DELETE FROM comments WHERE id=$1', [req.params.commentId]);
    await pool.query('UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id=$1', [req.params.postId]);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
