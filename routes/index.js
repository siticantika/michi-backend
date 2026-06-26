const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const menuRoutes = require('./menu');
const transaksiRoutes = require('./transaksi');
const pengeluaranRoutes = require('./pengeluaran')

// Route utama ini menggabungkan semua modul route agar backend lebih terstruktur.
// Dengan pola ini, setiap fitur punya rute sendiri sehingga kode lebih mudah dipelihara.
router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/transaksi', transaksiRoutes);
router.use("/pengeluaran", require("./pengeluaran"));

module.exports = router;
