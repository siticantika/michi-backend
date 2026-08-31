const db = require("../config/db");
const jwt = require('jsonwebtoken');
const logActivity = require('../utils/logActivity');


async function ensureVarianLevelColumns() {
  try {
    const [vRows] = await db.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi_detail' AND COLUMN_NAME = ?`,
      ['varian']
    );
    if (!vRows || vRows[0].cnt === 0) {
      await db.query(`ALTER TABLE transaksi_detail ADD COLUMN varian VARCHAR(255)`);
    }

    const [lRows] = await db.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi_detail' AND COLUMN_NAME = ?`,
      ['level']
    );
    if (!lRows || lRows[0].cnt === 0) {
      await db.query(`ALTER TABLE transaksi_detail ADD COLUMN level VARCHAR(255)`);
    }
  } catch (err) {
    console.warn('ensureVarianLevelColumns failed:', err && err.message ? err.message : err);
  }
}

async function ensureSelesaiColumn() {
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi' AND COLUMN_NAME = ?`,
      ['selesai']
    );
    if (!rows || rows[0].cnt === 0) {
      await db.query(`ALTER TABLE transaksi ADD COLUMN selesai TINYINT(1) DEFAULT 0`);
    }
  } catch (err) {
    console.warn('ensureSelesaiColumn failed:', err && err.message ? err.message : err);
  }
}

async function ensureTransaksiDateTimeColumns() {
  try {
    const [dateCol] = await db.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi' AND COLUMN_NAME = ?`,
      ['tanggal']
    );
    if (!dateCol || dateCol[0].cnt === 0) {
      await db.query(`ALTER TABLE transaksi ADD COLUMN tanggal DATE`);
    }

    const [timeCol] = await db.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transaksi' AND COLUMN_NAME = ?`,
      ['waktu']
    );
    if (!timeCol || timeCol[0].cnt === 0) {
      await db.query(`ALTER TABLE transaksi ADD COLUMN waktu TIME`);
    }
  } catch (err) {
    console.warn('ensureTransaksiDateTimeColumns failed:', err && err.message ? err.message : err);
  }
}

// Fungsi ini menerima checkout dari frontend dan menyimpan data ke database.
// Prosesnya meliputi pembuatan header transaksi, detail item, dan pencatatan pemasukan keuangan.
exports.tambahTransaksi = async (req, res) => {
  console.log("BODY:", req.body);

  try {
    console.log('=== TRANSAKSI REQUEST ===');

    const {
      metode,
      total,
      kasir_id,
      jenis_harga,
      waktu: clientWaktu,
      tanggal: clientTanggal
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    if (!metode || !total || !kasir_id || !jenis_harga || items.length === 0) {
      return res.status(400).json({ message: "Data transaksi tidak lengkap" });
    }

    // Pastikan kolom varian/level ada sebelum menyimpan detail.
    // Ini penting supaya sistem tidak error saat ada menu dengan varian atau level.
    await ensureVarianLevelColumns();
    await ensureTransaksiDateTimeColumns();

    // Bagian ini membuat header transaksi utama.
    // Header ini ibarat kepala nota yang berisi metode pembayaran, total, dan kasir.
    // prefer client-provided waktu/tanggal when available
    const pad = (n) => n.toString().padStart(2, '0');
    // Use server date to ensure transaksi appears in today's list (server CURDATE).
    const now = new Date();
    let tanggalVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    let waktuVal = clientWaktu;
    if (!waktuVal || !/\d{2}:\d{2}(:\d{2})?/.test(waktuVal)) {
      waktuVal = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    } else {
      // normalize waktu to HH:MM:SS
      const parts = waktuVal.split(':');
      const hh = pad(Number(parts[0] || 0));
      const mm = pad(Number(parts[1] || 0));
      const ss = pad(Number(parts[2] || 0));
      waktuVal = `${hh}:${mm}:${ss}`;
    }

    const [trx] = await db.query(
      `INSERT INTO transaksi (metode, total, kasir_id, jenis_harga, tanggal, waktu) VALUES (?, ?, ?, ?, ?, ?)`,
      [metode, total, kasir_id, jenis_harga, tanggalVal, waktuVal]
    );

    const transaksiId = trx.insertId;

    if (metode === "qris" && req.file) {
      const buktiPath = `/uploads/${req.file.filename}`;

      await db.query(
        "UPDATE transaksi SET bukti_qris = ? WHERE id = ?",
        [buktiPath, transaksiId]
      );
    }

    // Bagian ini menyimpan detail tiap item pesanan ke tabel transaksi_detail.
    // Transaksi adalah ringkasan utama, sedangkan transaksi_detail adalah daftar barang yang dibeli.
    // Dengan pola ini, histori tetap utuh bahkan jika data menu berubah di masa depan.
    // Subtotal per item dihitung dari harga dikali jumlah.
    // Data ini penting untuk menampilkan isi transaksi di riwayat pesanan dan menjaga histori tetap aman.
    for (const item of items) {
      await db.query(
        `INSERT INTO transaksi_detail
         (transaksi_id, menu_id, nama_menu, harga, jumlah, subtotal, varian, level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transaksiId,
          item.menu_id,
          item.nama_menu,
          item.harga,
          item.jumlah,
          item.harga * item.jumlah,
          item.varian || null,
          item.level || null,
        ]
      );
    }

    // Bagian ini mencatat pemasukan transaksi ke tabel keuangan agar owner bisa melihat laporan keuangan.
    // Transaksi kasir akan muncul di laporan owner lewat kolom transaksi_id yang menghubungkan kedua data ini.
    // Jadi satu transaksi kasir sekaligus memengaruhi laporan keuangan.
    await db.query(
      `INSERT INTO keuangan
      (tanggal, waktu, jenis, sumber, jumlah, ditambahkan_oleh, transaksi_id)
      VALUES (?, ?, 'pemasukan', ?, ?, 'kasir', ?)`,
      [tanggalVal, waktuVal, metode, total, transaksiId]
    );

    // Tambahkan log aktivitas langsung ke tabel activity_log setelah INSERT transaksi.
    // Informasi user diambil dari token JWT, lalu dicatat sebagai siapa yang melakukan transaksi.
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization;
      const tkn = authHeader?.split(' ')[1];
      console.log('Token untuk log transaksi:', tkn ? (tkn.substring(0, 20) + '...') : 'NULL');
      if (tkn) {
        const jwt = require('jsonwebtoken');
        const dec = jwt.decode(tkn);
        console.log('Decoded token:', dec ? { id: dec.id, role: dec.role, username: dec.username } : 'NULL');
        if (dec) {
          const [logResult] = await db.query(
            `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) 
             VALUES (?, ?, ?, 'tambah transaksi', NOW())`,
            [dec.id || 0, dec.role || '', dec.username || '']
          );
          console.log('Log tambah transaksi berhasil, insertId:', logResult.insertId);
        }
      } else {
        console.log('TIDAK ADA TOKEN - log transaksi tidak tersimpan');
      }
    } catch(logErr) {
      console.error('Log transaksi ERROR DETAIL:', logErr);
    }

    return res.json({ message: "Checkout berhasil" });
  } catch (err) {
    console.error("ERROR CHECKOUT:", err);
    return res.status(500).json({ message: "Checkout gagal" });
  }
};

exports.getTransaksiHariIni = async (req, res) => {
  try {
    const { jenis_harga } = req.query;

    await ensureVarianLevelColumns();
    await ensureSelesaiColumn();
    await ensureTransaksiDateTimeColumns();

    // ==========================================
    // 1. AMBIL DATA TRANSAKSI
    // ==========================================
    let queryTransaksi = `
      SELECT
        t.id,
        t.tanggal,
        t.waktu,
        t.metode,
        t.total,
        t.jenis_harga,
        t.bukti_qris,
        t.selesai
      FROM transaksi t
      WHERE DATE(t.tanggal) = CURDATE()
    `;

    const params = [];

    if (jenis_harga && jenis_harga !== "semua") {
      queryTransaksi += ` AND t.jenis_harga = ?`;
      params.push(jenis_harga);
    }

    queryTransaksi += `
      ORDER BY t.tanggal DESC, t.waktu DESC, t.id DESC
    `;

    const [transaksiRows] = await db.query(
      queryTransaksi,
      params
    );

    // ==========================================
    // 2. AMBIL DETAIL ITEM DARI TRANSAKSI_DETAIL
    // ==========================================
    const result = [];

    for (const transaksi of transaksiRows) {

      const [detailRows] = await db.query(
        `
        SELECT
          td.menu_id,
          td.nama_menu,
          td.harga,
          td.jumlah,
          td.subtotal,
          td.varian,
          td.level,
          m.icon
        FROM transaksi_detail td
        LEFT JOIN menu m ON m.id = td.menu_id
        WHERE td.transaksi_id = ?
        ORDER BY td.id ASC
        `,
        [transaksi.id]
      );

      const items = detailRows.map(item => ({
        nama: item.nama_menu || '',
        qty: Number(item.jumlah) || 0,
        harga: Number(item.harga) || 0,
        icon: item.icon || null,
        varian: item.varian || null,
        level: item.level || null
      }));

      result.push({
        id: transaksi.id,
        tanggal: transaksi.tanggal,
        waktu: transaksi.waktu,
        metode: transaksi.metode,
        total: Number(transaksi.total) || 0,
        jenis_harga: transaksi.jenis_harga,
        bukti_qris: transaksi.bukti_qris || null,
        selesai: Number(transaksi.selesai) || 0,
        items
      });
    }

    // ==========================================
    // 3. DEBUG
    // ==========================================
    console.log(
      'DATA TRANSAKSI:',
      result.map(r => ({
        id: r.id,
        metode: r.metode,
        total: r.total,
        jenis_harga: r.jenis_harga,
        items: r.items
      }))
    );

    return res.json(result);

  } catch (err) {
    console.error("ERROR GET TRANSAKSI:", err);
    return res.status(500).json({
      message: "Gagal ambil transaksi",
      error: err.message
    });
  }
};

exports.setTransaksiSelesai = async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    let { selesai } = payload;

    await ensureSelesaiColumn();

    if (typeof selesai === 'undefined') {
      const [rows] = await db.query('SELECT selesai FROM transaksi WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
      selesai = Number(rows[0].selesai) === 1 ? 0 : 1;
    } else {
      const normalized =
        typeof selesai === 'string'
          ? ['1', 'true', 'yes', 'on'].includes(selesai.toLowerCase())
          : Boolean(selesai);
      selesai = normalized ? 1 : 0;
    }

    const [result] = await db.query('UPDATE transaksi SET selesai = ? WHERE id = ?', [selesai, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    return res.json({ message: 'OK', id, selesai });
  } catch (err) {
    console.error('ERROR setTransaksiSelesai:', err);
    return res.status(500).json({ message: 'Gagal update transaksi' });
  }
};
