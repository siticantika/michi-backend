const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const menuRoutes = require('./menu');
const transaksiRoutes = require('./transaksi');
const pengeluaranRoutes = require('./pengeluaran')

router.use('/auth', authRoutes);
router.use('/menu', menuRoutes);
router.use('/transaksi', transaksiRoutes);
router.use("/pengeluaran", require("./pengeluaran"));

module.exports = router;
