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

    // Bagian ini menyimpan pemasukan manual owner ke tabel keuangan.
    // Untuk jenis pemasukan, kategori_pengeluaran harus disimpan sebagai NULL.
    await db.query(`
      INSERT INTO keuangan
      (tanggal, waktu, jenis, sumber, keterangan, jumlah, ditambahkan_oleh, kategori_pengeluaran)
      VALUES (?, ?, 'pemasukan', 'owner', ?, ?, "owner", NULL)`, 
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
        ditambahkan_oleh,
        UNIX_TIMESTAMP(CONCAT(tanggal, ' ', waktu)) AS ts
      FROM keuangan
      WHERE jenis = 'pemasukan'
      AND tanggal = DATE(NOW())
      -- Exclude entries that are linked to a transaksi (i.e. kasir checkout entries)
      AND transaksi_id IS NULL
      ORDER BY ts DESC
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
    kategori_pengeluaran,
    keterangan,
    jumlah,
    ditambahkan_oleh
  FROM keuangan
  WHERE jenis = 'pengeluaran'
    AND tanggal = CURDATE()
    AND ditambahkan_oleh = 'owner'
    AND transaksi_id IS NULL
  ORDER BY tanggal DESC, waktu DESC
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
    const { keterangan, jumlah, kategori_pengeluaran, waktu: clientWaktu, tanggal: clientTanggal } = req.body;

    if (!keterangan || !jumlah) {
      return res.status(400).json({ message: "Data tidak lengkap" });
    }

    // Prefer client-provided tanggal/waktu when valid so stored value matches user's clock
    const pad = (n) => n.toString().padStart(2, '0');
    const now = new Date();
    let tanggal;
    if (clientTanggal && typeof clientTanggal === 'string' && clientTanggal.match(/^\d{4}-\d{2}-\d{2}$/)) {
      tanggal = clientTanggal;
    } else {
      tanggal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    let waktu;
    if (clientWaktu && typeof clientWaktu === 'string' && clientWaktu.match(/^\d{1,2}:\d{2}(:\d{2})?$/)) {
      const parts = clientWaktu.split(':');
      const hh = pad(Number(parts[0] || 0));
      const mm = pad(Number(parts[1] || 0));
      const ss = pad(Number(parts[2] || 0));
      waktu = `${hh}:${mm}:${ss}`;
    } else {
      waktu = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    // Bagian ini menyimpan pengeluaran owner ke tabel keuangan.
    // Nilai ditambahkan_oleh membantu sistem membedakan siapa yang menambahkan data.
    await db.query(
      `INSERT INTO keuangan
      (tanggal, waktu, jenis, sumber, keterangan, jumlah, ditambahkan_oleh, kategori_pengeluaran)
      VALUES (?, ?, 'pengeluaran', 'owner', ?, ?, 'owner', ?)`,
      [tanggal, waktu, keterangan, jumlah, kategori_pengeluaran || null]
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
