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

// Fungsi ini menerima checkout dari frontend dan menyimpan data ke database.
// Prosesnya meliputi pembuatan header transaksi, detail item, dan pencatatan pemasukan keuangan.
exports.tambahTransaksi = async (req, res) => {
  console.log("BODY:", req.body);

  // Data pesanan dari frontend dikirim dalam bentuk array item.
  // Bagian ini mengubah data tersebut menjadi array agar bisa diproses satu per satu.
  const items = JSON.parse(req.body.items || "[]");
  console.log("ITEMS:", items);
  try {
    console.log('=== TRANSAKSI REQUEST ===');
    console.log('Auth header:', req.headers.authorization ? 'ADA' : 'TIDAK ADA');
    const { metode, total, kasir_id, jenis_harga } = req.body;
    const items = JSON.parse(req.body.items || "[]");

    if (!metode || !total || !kasir_id || !jenis_harga || items.length === 0) {
      return res.status(400).json({ message: "Data transaksi tidak lengkap" });
    }

    // Pastikan kolom varian/level ada sebelum menyimpan detail.
    // Ini penting supaya sistem tidak error saat ada menu dengan varian atau level.
    await ensureVarianLevelColumns();

    // Bagian ini membuat header transaksi utama.
    // Header ini ibarat kepala nota yang berisi metode pembayaran, total, dan kasir.
    const [trx] = await db.query( `INSERT INTO transaksi (metode, total, kasir_id, jenis_harga) VALUES (?, ?, ?, ?)`,
    [metode, total, kasir_id, jenis_harga]
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
      VALUES (CURDATE(), CURTIME(), 'pemasukan', ?, ?, 'kasir', ?)`,
      [metode, total, transaksiId]
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
    let whereClause = "WHERE DATE(t.tanggal)=CURDATE()";
    const params = [];

    if (jenis_harga && jenis_harga !== "semua") {
      whereClause += " AND t.jenis_harga = ?";
      params.push(jenis_harga);
    }

    await ensureVarianLevelColumns();
    await ensureSelesaiColumn();

    // Bagian ini mengambil riwayat transaksi hari ini dan menggabungkan data dari beberapa tabel.
    // Data dari tabel transaksi, transaksi_detail, users, dan menu digabung agar tampilan riwayat lebih lengkap.
    // Query ini bekerja seperti penghubung antar tabel agar tampilan riwayat bisa menampilkan nama kasir dan daftar item.
    const [rows] = await db.query(`
    SELECT
    t.id,
    COALESCE(t.selesai,0) AS selesai,
    t.tanggal,
    t.metode,
    t.total,
    t.jenis_harga,
    t.bukti_qris,
    u.username AS kasir,

    GROUP_CONCAT(
      CONCAT(
        td.nama_menu,'|',
        td.jumlah,'|',
        td.harga,'|',
        COALESCE(m.icon,''),'|',
        COALESCE(td.varian,''),'|',
        COALESCE(td.level,'')
      )
      SEPARATOR ';;'
    ) AS items,

    SUM(td.jumlah) AS total_jumlah

FROM transaksi t
LEFT JOIN users u
ON t.kasir_id=u.id

LEFT JOIN transaksi_detail td
ON t.id=td.transaksi_id

LEFT JOIN menu m
ON td.menu_id=m.id

${whereClause}

GROUP BY
t.id,
t.selesai,
t.tanggal,
t.metode,
t.total,
t.jenis_harga,
t.bukti_qris,
u.username

ORDER BY t.tanggal DESC
`, params);
    const result = rows.map(row => ({
      ...row,
      items: row.items
        ? row.items.split(';;').map(it => {
            const [nama, qty, harga, icon, varian, level] = it.split('|');
            return {
              nama: nama || '',
              qty: Number(qty) || 0,
              harga: Number(harga) || 0,
              icon: icon || null,
              varian: varian || null,
              level: level || null,
            };
          })
        : [],
    }));

    console.log('DATA DARI DB:', rows.map(r => ({ id: r.id, items: r.items })));

    return res.json(result);
  } catch (err) {
    console.error("ERROR GET TRANSAKSI:", err);
    return res.status(500).json({ message: "Gagal ambil transaksi" });
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
