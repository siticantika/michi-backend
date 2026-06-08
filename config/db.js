const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool(process.env.DATABASE_URL);

module.exports = db;