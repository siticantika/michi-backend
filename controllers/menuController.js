const db = require("../config/db");
const jwt = require('jsonwebtoken');


const tambahMenu = async (req, res) => {
  try {
    console.log('=== MENU REQUEST ===');
    console.log('Auth header:', req.headers.authorization ? 'ADA' : 'TIDAK ADA');
    const { nama, icon, harga, kategori, deskripsi, varian, level } = req.body;
    if (
      nama === undefined ||
      icon === undefined ||
      harga === undefined ||
      kategori === undefined
    ) {
      return res.status(400).json({
        message: "Field wajib belum lengkap",
      });
    }

    // Buat tabel menu jika belum ada
    const createTableQuery = `CREATE TABLE IF NOT EXISTS menu (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nama VARCHAR(255) NOT NULL,
      icon VARCHAR(255),
      harga VARCHAR(50) NOT NULL,
      kategori VARCHAR(100) NOT NULL,
      deskripsi TEXT,
      varian TEXT,
      level TEXT
    )`;
    await db.query(createTableQuery);

    const query = `
      INSERT INTO menu 
      (nama, icon, harga, kategori, deskripsi, varian, level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(
      query,
      [
        nama,
        icon,
        harga,
        kategori,
        deskripsi || null,
        varian || null,
        level || null,
      ]
    );
    // attempt to log activity (non-blocking)
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization;
      const tkn = authHeader?.split(' ')[1];
      if (tkn) {
        const dec = require('jsonwebtoken').decode(tkn);
        if (dec) {
          await db.query(
            `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (?, ?, ?, 'tambah menu', NOW())`,
            [dec.id, dec.role, dec.username]
          );
          console.log('Log menu berhasil:', dec.username);
        }
      }
    } catch (logErr) {
      console.error('Log menu error:', logErr.message);
    }

    res.status(201).json({
      message: "Menu berhasil ditambahkan",
      id: result.insertId,
    });
  } catch (err) {
    console.error("SQL ERROR:", err);
    res.status(500).json({ message: "Gagal menambah menu" });
  }
};

const updateMenu = async (req, res) => {
  try {
    console.log('=== MENU REQUEST ===');
    console.log('Auth header:', req.headers.authorization ? 'ADA' : 'TIDAK ADA');
    const { id } = req.params;
    const { nama, icon, harga, kategori, deskripsi, varian, level } = req.body;
    if (!id) {
      return res.status(400).json({ message: "ID menu diperlukan" });
    }
    const query = `
      UPDATE menu 
      SET nama = ?, icon = ?, harga = ?, kategori = ?, deskripsi = ?, varian = ?, level = ?
      WHERE id = ?
    `;
    const [result] = await db.query(query, [
      nama,
      icon,
      harga,
      kategori,
      deskripsi || null,
      varian || null,
      level || null,
      id,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Menu tidak ditemukan" });
    }
    // attempt to log activity (non-blocking)
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization;
      const tkn = authHeader?.split(' ')[1];
      if (tkn) {
        const dec = require('jsonwebtoken').decode(tkn);
        if (dec) {
          await db.query(
            `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (?, ?, ?, 'edit menu', NOW())`,
            [dec.id, dec.role, dec.username]
          );
          console.log('Log menu berhasil:', dec.username);
        }
      }
    } catch (logErr) {
      console.error('Log menu error:', logErr.message);
    }

    res.status(200).json({ message: "Menu berhasil diupdate" });
  } catch (err) {
    console.error("SQL ERROR:", err);
    res.status(500).json({ message: "Gagal update menu" });
  }
};

const deleteMenu = async (req, res) => {
  try {
    console.log('=== MENU REQUEST ===');
    console.log('Auth header:', req.headers.authorization ? 'ADA' : 'TIDAK ADA');
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "ID menu diperlukan" });
    }
    const query = `DELETE FROM menu WHERE id = ?`;
    const [result] = await db.query(query, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Menu tidak ditemukan" });
    }
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization;
      const tkn = authHeader?.split(' ')[1];
      if (tkn) {
        const dec = require('jsonwebtoken').decode(tkn);
        if (dec) {
          await db.query(
            `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) VALUES (?, ?, ?, 'hapus menu', NOW())`,
            [dec.id, dec.role, dec.username]
          );
          console.log('Log menu berhasil:', dec.username);
        }
      }
    } catch (logErr) {
      console.error('Log menu error:', logErr.message);
    }

    res.status(200).json({ message: "Menu berhasil dihapus" });
  } catch (err) {
    console.error("SQL ERROR:", err);
    res.status(500).json({ message: "Gagal hapus menu" });
  }
};

module.exports = {
  tambahMenu,
  updateMenu,
  deleteMenu,
};
