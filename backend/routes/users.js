const express = require('express');
const multer = require('multer');
const path = require('path');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../frontend/uploads')),
  filename: (req, file, cb) => cb(null, `avatar_${req.user.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.avatar, u.bio, u.role, u.created_at,
        (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS followers_count,
        (SELECT COUNT(*) FROM followers WHERE follower_id = u.id) AS following_count,
        (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS posts_count
       FROM users u WHERE u.id=$1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.avatar, u.bio, u.created_at,
        (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS followers_count,
        (SELECT COUNT(*) FROM followers WHERE follower_id = u.id) AS following_count,
        (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS posts_count,
        EXISTS(SELECT 1 FROM followers WHERE follower_id=$2 AND following_id=u.id) AS is_following
       FROM users u WHERE u.id=$1`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/me', authenticate, upload.single('avatar'), async (req, res) => {
  const { bio, username } = req.body;
  const avatar = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (bio !== undefined) { fields.push(`bio=$${idx++}`); values.push(bio); }
    if (username) { fields.push(`username=$${idx++}`); values.push(username); }
    if (avatar) { fields.push(`avatar=$${idx++}`); values.push(avatar); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.user.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(',')} WHERE id=$${idx} RETURNING id, username, email, avatar, bio, role`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/follow', authenticate, async (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot follow yourself' });

  try {
    const existing = await pool.query(
      'SELECT id FROM followers WHERE follower_id=$1 AND following_id=$2',
      [req.user.id, targetId]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM followers WHERE follower_id=$1 AND following_id=$2', [req.user.id, targetId]);
      return res.json({ following: false });
    } else {
      await pool.query('INSERT INTO followers (follower_id, following_id) VALUES ($1,$2)', [req.user.id, targetId]);
      return res.json({ following: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/followers', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.avatar FROM users u
       JOIN followers f ON f.follower_id = u.id
       WHERE f.following_id=$1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/following', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.avatar FROM users u
       JOIN followers f ON f.following_id = u.id
       WHERE f.follower_id=$1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/search/query', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT id, username, avatar, bio FROM users WHERE username ILIKE $1 AND is_active=true LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
