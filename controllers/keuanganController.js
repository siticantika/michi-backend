const db = require("../config/db");
const jwt = require('jsonwebtoken');
const logActivity = require('../utils/logActivity');

// ===============================
// TAMBAH PEMASUKAN (OWNER)
// ===============================
exports.tambahPemasukan = async (req, res) => {
  try {
    const { keterangan, jumlah } = req.body;

    if (!keterangan || !jumlah) {
      return res.status(400).json({ message: "Data tidak lengkap" });
    }

    // Use server local date/time to avoid DB timezone mismatch
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const tanggal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const waktu = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    await db.query(`
      INSERT INTO keuangan
      (tanggal, waktu, jenis, sumber, keterangan, jumlah, ditambahkan_oleh)
      VALUES (?, ?, 'pemasukan', 'owner', ?, ?, "owner")`, 
      [tanggal, waktu, keterangan, jumlah]);

    // log activity if token present
    try {
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = token ? jwt.decode(token) : null;
      const uid = (decoded && (decoded.id || decoded.userId)) || 0;
      const role = (decoded && decoded.role) || 'owner';
      const nama = (decoded && (decoded.username || decoded.nama)) || 'owner';
      await logActivity(uid, role, nama, 'tambah pemasukan');
    } catch (e) {
      console.warn('pemasukan logActivity failed:', e && e.message ? e.message : e);
    }

    res.json({ message: "Pemasukan berhasil ditambahkan" });
  } catch (err) {
    console.error("ERROR TAMBAH PEMASUKAN:", err);
    res.status(500).json({ message: "Gagal menambah pemasukan" });
  }
};

// ===============================
// GET PEMASUKAN HARI INI (OWNER)
// ===============================
exports.getPemasukanHariIni = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        waktu,
        sumber,
        keterangan,
        jumlah,
        ditambahkan_oleh
      FROM keuangan
      WHERE jenis = 'pemasukan'
      AND tanggal = DATE(NOW())
      -- Exclude entries that are linked to a transaksi (i.e. kasir checkout entries)
      AND transaksi_id IS NULL
      ORDER BY waktu DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal ambil pemasukan" });
  }
};

// ===============================
// DELETE PEMASUKAN (OWNER)
// ===============================
exports.hapusPemasukan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "ID diperlukan" });

    await db.query("DELETE FROM keuangan WHERE id = ?", [id]);
    // log activity (non-blocking)
    try {
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = token ? require('jsonwebtoken').decode(token) : null;
      const uid = (decoded && (decoded.id || decoded.userId)) || 0;
      const role = (decoded && decoded.role) || 'admin';
      const nama = (decoded && (decoded.username || decoded.nama)) || 'admin';
      await db.query(
        `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (?, ?, ?, 'hapus pemasukan', NOW())`,
        [uid, role, nama]
      );
    } catch (e) {}

    res.json({ message: "Pemasukan dihapus" });
  } catch (err) {
    console.error("ERROR HAPUS PEMASUKAN:", err);
    res.status(500).json({ message: "Gagal menghapus pemasukan" });
  }
};

// ==========================
// GET PENGELUARAN HARI INI
// ==========================
exports.getPengeluaranHariIni = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        tanggal,
        waktu,
        keterangan,
        jumlah,
        ditambahkan_oleh
      FROM keuangan
      WHERE jenis = 'pengeluaran'
      AND tanggal = CURDATE()
      -- Only include owner-created pengeluaran on the owner pengeluaran page
      AND ditambahkan_oleh = 'owner'
      -- Exclude entries that are linked to a transaksi (i.e. kasir checkout entries)
      AND transaksi_id IS NULL
      ORDER BY waktu DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil pengeluaran" });
  }
};

// ==========================
// TAMBAH PENGELUARAN OWNER
// ==========================
exports.tambahPengeluaran = async (req, res) => {
  try {
    const { keterangan, jumlah } = req.body;

    if (!keterangan || !jumlah) {
      return res.status(400).json({ message: "Data tidak lengkap" });
    }

    // Use server local date/time to avoid DB timezone mismatch
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const tanggal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const waktu = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    await db.query(
  `INSERT INTO keuangan
  (tanggal, waktu, jenis, sumber, keterangan, jumlah, ditambahkan_oleh)
  VALUES (?, ?, 'pengeluaran', 'owner', ?, ?, 'owner')`,
  [tanggal, waktu, keterangan, jumlah]
);

    try {
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = token ? jwt.decode(token) : null;
      const uid = (decoded && (decoded.id || decoded.userId)) || 0;
      const role = (decoded && decoded.role) || 'owner';
      const nama = (decoded && (decoded.username || decoded.nama)) || 'owner';
      await logActivity(uid, role, nama, 'tambah pengeluaran');
    } catch (e) {
      console.warn('owner pengeluaran logActivity failed:', e && e.message ? e.message : e);
    }

    res.json({ message: "Pengeluaran berhasil ditambahkan" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menambah pengeluaran" });
  }
};

// ==========================
// HAPUS PENGELUARAN
// ==========================
exports.hapusPengeluaran = async (req, res) => {
  try {
    const { id } = req.params;

    await db.query(
      "DELETE FROM keuangan WHERE id = ? AND jenis = 'pengeluaran'",
      [id]
    );

    res.json({ message: "Pengeluaran berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menghapus pengeluaran" });
  }
};
