const mysql = require("mysql2/promise");
require("dotenv").config();

// File ini membuat koneksi ke database MySQL yang dipakai oleh seluruh backend.
// Semua controller mengambil data lewat pool koneksi ini, sehingga akses database terpusat.
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: Number(process.env.MYSQLPORT),
  timezone: '+07:00'
});

module.exports = db;