const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logActivity = require('../utils/logActivity');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Middleware to verify admin JWT
const verifyAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Ensure `nama` column exists on users table (some DBs don't have it)
async function ensureNamaColumn() {
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      ['nama']
    );
    if (!rows || rows[0].cnt === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN nama VARCHAR(255) NULL`);
      console.log('Added nama column to users table');
    }
  } catch (err) {
    console.warn('ensureNamaColumn failed:', err && err.message ? err.message : err);
  }
}

// 1) POST /api/admin/login -> check admins table
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Field wajib' });
  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ message: 'Admin tidak ditemukan' });
    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ message: 'Password salah' });
    const token = jwt.sign({ id: admin.id, role: 'admin' }, JWT_SECRET);
    res.json({ message: 'Login berhasil', token, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 2) GET /api/admin/users -> return users list (id, nama, username, role, created_at)
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    // ensure schema compatible
    await ensureNamaColumn();
    const [rows] = await db.query(
      'SELECT id, username, role, nama FROM users ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 3) POST /api/admin/users -> create user
router.post('/users', verifyAdmin, async (req, res) => {
  const { nama, username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ message: 'Field wajib' });
  try {
    // ensure schema has nama column
    await ensureNamaColumn();
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query('INSERT INTO users (nama, username, password, role) VALUES (?, ?, ?, ?)', [nama || null, username, hash, role]);
    // log admin activity (both structured logActivity and explicit activity_log row for admin)
    try { await logActivity(req.admin.id, 'admin', req.admin.username || 'admin', `Buat user id=${result.insertId} username=${username}`); } catch(e){console.warn('logActivity admin create user failed', e)}
    try {
      await db.query(
        `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (0, 'admin', 'admin', ?, NOW())`,
        [`tambah user: ${username}`]
      );
    } catch (e) {}
    res.status(201).json({ message: 'User dibuat', id: result.insertId });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 4) DELETE /api/admin/users/:id -> delete user
router.delete('/users/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    try { await logActivity(req.admin.id, 'admin', req.admin.username || 'admin', `Hapus user id=${id}`); } catch(e){console.warn('logActivity admin delete user failed', e)}
    try {
      await db.query(
        `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (0, 'admin', 'admin', ?, NOW())`,
        [`hapus user: ${id}`]
      );
    } catch (e) {}
    res.json({ message: 'User dihapus' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 5) GET /api/admin/activity-log -> latest 100 ordered by waktu desc
router.get('/activity-log', verifyAdmin, async (req, res) => {
  try {
    const { tanggal } = req.query;
    let query, params;
    // NOTE: aplikasi menggunakan waktu lokal MySQL (WITA).
    // Jika Anda perlu mengatur timezone pada server MySQL, jalankan di phpMyAdmin:
    // SET GLOBAL time_zone = '+08:00';
    // SET time_zone = '+08:00';

    if (tanggal) {
      query = `
        SELECT * FROM activity_log 
        WHERE DATE(waktu) = ?
        ORDER BY waktu DESC 
        LIMIT 100
      `;
      params = [tanggal];
    } else {
      query = `
        SELECT * FROM activity_log 
        WHERE DATE(waktu) = CURDATE()
        ORDER BY waktu DESC 
        LIMIT 100
      `;
      params = [];
    }
    
    const [logs] = await db.query(query, params);
    console.log('Activity log query result:', logs.length, 'rows for tanggal:', tanggal || 'today');
    res.json(logs);
  } catch (err) {
    console.error('Get activity log error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 7) PUT /api/admin/users/:id/reset-password -> reset user's password
router.put('/users/:id/reset-password', verifyAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password tidak boleh kosong' });
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);
    try { await logActivity(req.admin.id, 'admin', req.admin.username || 'admin', `Reset password user id=${req.params.id}`); } catch(e){console.warn('logActivity admin reset password failed', e)}
    try {
      await db.query(
        `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (0, 'admin', 'admin', ?, NOW())`,
        [`reset password: ${req.params.id}`]
      );
    } catch (e) {}
    res.json({ message: 'Password berhasil direset' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Gagal reset password' });
  }
});

// 6) GET /api/admin/online-users -> determine truly online users by last activity = login
router.get('/online-users', verifyAdmin, async (req, res) => {
  try {
    // Ambil baris TERAKHIR setiap user
    // Kalau baris terakhir = login → dia online sekarang
    const [rows] = await db.query(`
      SELECT a.user_id, a.nama, a.role, a.aksi, a.waktu
      FROM activity_log a
      INNER JOIN (
        SELECT user_id, MAX(id) as last_id
        FROM activity_log
        WHERE aksi IN ('login', 'logout')
        GROUP BY user_id
      ) b ON a.id = b.last_id
      WHERE a.aksi = 'login'
    `);
    res.json(rows);
  } catch (err) {
    console.error('Get online users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
