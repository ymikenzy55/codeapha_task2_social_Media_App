const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { authenticate, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, adminOnly);

router.get('/stats', async (req, res) => {
  try {
    const [users, posts, comments, likes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM posts'),
      pool.query('SELECT COUNT(*) FROM comments'),
      pool.query('SELECT COUNT(*) FROM likes')
    ]);
    res.json({
      users: parseInt(users.rows[0].count),
      posts: parseInt(posts.rows[0].count),
      comments: parseInt(comments.rows[0].count),
      likes: parseInt(likes.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.avatar, u.bio, u.role, u.is_active, u.created_at,
        (SELECT COUNT(*) FROM posts WHERE user_id=u.id) AS posts_count,
        (SELECT COUNT(*) FROM followers WHERE following_id=u.id) AS followers_count
       FROM users u
       WHERE u.username ILIKE $1 OR u.email ILIKE $1
       ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`,
      [`%${search}%`, limit, offset]
    );
    const total = await pool.query(
      'SELECT COUNT(*) FROM users WHERE username ILIKE $1 OR email ILIKE $1',
      [`%${search}%`]
    );
    res.json({ users: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET is_active = NOT is_active WHERE id=$1 RETURNING id, username, is_active',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const result = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, username, role',
      [role, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/posts', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT p.*, u.username, u.avatar FROM posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await pool.query('SELECT COUNT(*) FROM posts');
    res.json({ posts: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM posts WHERE id=$1', [req.params.id]);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/create-admin', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1,$2,$3,'admin') RETURNING id, username, email, role`,
      [username, email, hashed]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
