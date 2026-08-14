const mysql = require("mysql2/promise");
require("dotenv").config();

const databaseUrl = process.env.MYSQL_PUBLIC_URL;

console.log("Menggunakan koneksi Railway:", databaseUrl ? "ADA" : "TIDAK ADA");

if (!databaseUrl) {
  throw new Error("MYSQL_PUBLIC_URL tidak ditemukan di .env");
}

const db = mysql.createPool(databaseUrl);

module.exports = db;