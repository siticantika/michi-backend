const db = require("../config/db");
const jwt = require('jsonwebtoken');
const logActivity = require('../utils/logActivity');

// GET semua pengeluaran
exports.getAll = async (req, res) => {
  try {
    // return today's pengeluaran created by kasir from consolidated keuangan table
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const [rows] = await db.query(
      `SELECT id, tanggal, waktu, keterangan, jumlah
       FROM keuangan
       WHERE jenis = 'pengeluaran' AND ditambahkan_oleh = 'kasir' AND tanggal = ?
       ORDER BY waktu DESC`,
      [today]
    );

    return res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST tambah pengeluaran
exports.create = async (req, res) => {
  const { keterangan, jumlah } = req.body;

  if (!keterangan || !jumlah) {
    return res.status(400).json({ message: "Data belum lengkap" });
  }
  // build local date/time to avoid DB timezone differences
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const tanggal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const waktu = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  try {
    // insert directly into consolidated `keuangan` table as pengeluaran by kasir
    const [result] = await db.query(
      `INSERT INTO keuangan (tanggal, waktu, jenis, sumber, keterangan, jumlah, ditambahkan_oleh)
       VALUES (?, ?, 'pengeluaran', 'kasir', ?, ?, 'kasir')`,
      [tanggal, waktu, keterangan, jumlah]
    );

    // log activity if token available
    try {
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = token ? jwt.decode(token) : null;
      const uid = (decoded && (decoded.id || decoded.userId)) || 0;
      const role = (decoded && decoded.role) || 'kasir';
      const nama = (decoded && (decoded.username || decoded.nama)) || 'kasir';
      await logActivity(uid, role, nama, 'tambah pengeluaran');
    } catch (e) {
      console.warn('pengeluaran logActivity failed:', e && e.message ? e.message : e);
    }

    return res.json({ message: 'Pengeluaran berhasil disimpan', id: result.insertId });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// PUT update pengeluaran
exports.update = async (req, res) => {
  const id = req.params.id;
  const { tanggal, waktu, keterangan, jumlah } = req.body;

  try {
    const fields = [];
    const params = [];

    if (tanggal !== undefined && tanggal !== '') {
      fields.push('tanggal = ?');
      params.push(tanggal);
    }
    if (waktu !== undefined && waktu !== '') {
      fields.push('waktu = ?');
      params.push(waktu);
    }
    if (keterangan !== undefined) {
      fields.push('keterangan = ?');
      params.push(keterangan);
    }
    if (jumlah !== undefined) {
      fields.push('jumlah = ?');
      params.push(jumlah);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    params.push(id);

    // update keuangan row for pengeluaran (allow owner edits of owner-created rows)
    const sqlKeu = `UPDATE keuangan SET ${fields.join(', ')} WHERE id = ? AND jenis = 'pengeluaran'`;
    await db.query(sqlKeu, params);

    // log activity (non-blocking)
    try {
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = token ? jwt.decode(token) : null;
      const uid = (decoded && (decoded.id || decoded.userId)) || 0;
      const role = (decoded && decoded.role) || 'owner';
      const nama = (decoded && (decoded.username || decoded.nama)) || 'owner';
      await db.query(
        `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (?, ?, ?, 'edit pengeluaran', NOW())`,
        [uid, role, nama]
      );
    } catch (e) {}

    res.json({ message: 'Pengeluaran berhasil diperbarui' });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ message: err.message });
  }
};

