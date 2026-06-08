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

exports.tambahTransaksi = async (req, res) => {
  try {
    console.log('=== TRANSAKSI REQUEST ===');
    console.log('Auth header:', req.headers.authorization ? 'ADA' : 'TIDAK ADA');
    const { metode, total, kasir_id } = req.body;
    const items = JSON.parse(req.body.items || "[]");

    if (!metode || !total || !kasir_id || items.length === 0) {
      return res.status(400).json({ message: "Data transaksi tidak lengkap" });
    }

    // Pastikan kolom varian/level ada sebelum menyimpan detail
    await ensureVarianLevelColumns();

    const [trx] = await db.query(
      "INSERT INTO transaksi (metode, total, kasir_id) VALUES (?, ?, ?)",
      [metode, total, kasir_id]
    );

    const transaksiId = trx.insertId;

    if (metode === "qris" && req.file) {
      const buktiPath = `/uploads/${req.file.filename}`;

      await db.query(
        "UPDATE transaksi SET bukti_qris = ? WHERE id = ?",
        [buktiPath, transaksiId]
      );
    }

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

    await db.query(
      `INSERT INTO keuangan
      (tanggal, waktu, jenis, sumber, jumlah, ditambahkan_oleh, transaksi_id)
      VALUES (CURDATE(), CURTIME(), 'pemasukan', ?, ?, 'kasir', ?)`,
      [metode, total, transaksiId]
    );

    // Tambahkan log aktivitas langsung ke tabel activity_log setelah INSERT transaksi
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
    // Pastikan kolom ada sebelum SELECT
    await ensureVarianLevelColumns();
    await ensureSelesaiColumn();

    const [rows] = await db.query(`
      SELECT 
        t.id,
        COALESCE(t.selesai,0) AS selesai,
        t.tanggal,
        t.metode,
        t.total,
        t.bukti_qris,
        u.username AS kasir,

        GROUP_CONCAT(
          CONCAT(
            td.nama_menu, '|', td.jumlah, '|', td.harga, '|', COALESCE(m.icon, ''), '|', COALESCE(td.varian, ''), '|', COALESCE(td.level, '')
          )
          SEPARATOR ';;'
        ) AS items,

        SUM(td.jumlah) AS total_jumlah

      FROM transaksi t
      LEFT JOIN users u ON t.kasir_id = u.id
      LEFT JOIN transaksi_detail td ON t.id = td.transaksi_id
      LEFT JOIN menu m ON td.menu_id = m.id
      WHERE DATE(t.tanggal) = CURDATE()
      GROUP BY t.id
      ORDER BY t.tanggal DESC
    `);

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
    const { selesai } = req.body;
    if (typeof selesai === 'undefined') return res.status(400).json({ message: 'Missing selesai value' });

    await ensureSelesaiColumn();

    const [result] = await db.query('UPDATE transaksi SET selesai = ? WHERE id = ?', [selesai ? 1 : 0, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Transaksi tidak ditemukan' });
    return res.json({ message: 'OK', id, selesai: selesai ? 1 : 0 });
  } catch (err) {
    console.error('ERROR setTransaksiSelesai:', err);
    return res.status(500).json({ message: 'Gagal update transaksi' });
  }
};
