const db = require("../config/db");
const jwt = require('jsonwebtoken');
const logActivity = require('../utils/logActivity');

// GET semua pengeluaran
// Endpoint ini mengambil catatan pengeluaran hari ini dari tabel keuangan.
// Data ini dipakai oleh halaman owner untuk melihat pengeluaran yang terjadi.
exports.getAll = async (req, res) => {
  try {
    // return today's pengeluaran created by kasir from consolidated keuangan table
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Bagian ini mengambil data pengeluaran kasir hari ini dari tabel keuangan.
    // Data ini kemudian ditampilkan ke halaman pengeluaran agar owner dan kasir bisa melihatnya.
    const [rows] = await db.query(
      `SELECT id, tanggal, waktu, kategori_pengeluaran, keterangan, jumlah
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
// Saat owner menambah pengeluaran, data disimpan ke tabel keuangan.
// Karena data ini juga dipakai untuk laporan dan dashboard, penyimpanan harus konsisten.
exports.create = async (req, res) => {
  const { keterangan, jumlah, kategori_pengeluaran } = req.body;

  if (!keterangan || !jumlah) {
    return res.status(400).json({ message: "Data belum lengkap" });
  }

  const normalizedKategori = kategori_pengeluaran === '' ? null : kategori_pengeluaran || null;

  // Use server date and server time to ensure consistent stored time across clients/servers
  const pad = (n) => n.toString().padStart(2, '0');
  const now = new Date();
  const tanggal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const waktu = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  try {
    // Bagian ini menyimpan pengeluaran kasir ke tabel keuangan.
    // Ini penting karena data pengeluaran ikut dipakai untuk perhitungan laporan dan dashboard.
    const [result] = await db.query(
      `INSERT INTO keuangan (tanggal, waktu, jenis, sumber, keterangan, jumlah, ditambahkan_oleh, kategori_pengeluaran)
       VALUES (?, ?, 'pengeluaran', 'kasir', ?, ?, 'kasir', ?)`,
      [tanggal, waktu, keterangan, jumlah, normalizedKategori]
    );
    console.log('Inserted pengeluaran with waktu:', waktu, 'tanggal:', tanggal);

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
// Fungsi ini memperbarui data pengeluaran yang sudah tersimpan sebelumnya.
// Ini membantu owner jika ingin mengoreksi keterangan atau nominal yang salah.
exports.update = async (req, res) => {
  const id = req.params.id;
  const { tanggal, waktu, keterangan, jumlah, kategori_pengeluaran } = req.body;

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
    if (kategori_pengeluaran !== undefined) {
      fields.push('kategori_pengeluaran = ?');
      params.push(kategori_pengeluaran === '' ? null : kategori_pengeluaran);
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

