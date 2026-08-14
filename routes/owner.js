const express = require("express");
const router = express.Router();
const ownerController = require("../controllers/ownerController");
const { verifyToken, verifyOwner } = require("../middleware/auth");

// File ini berfungsi sebagai penghubung antara URL dan controller.
// Jadi request dari frontend masuk ke route, lalu diteruskan ke fungsi yang sesuai di controller.
router.get("/dashboard", verifyToken, verifyOwner, ownerController.getDashboardOwner);
router.get("/laporan-bulanan", verifyToken, verifyOwner, ownerController.getLaporanBulanan);
router.get("/grafik-bulanan", verifyToken, verifyOwner, ownerController.getGrafikBulanan);
router.get("/grafik-pengeluaran-kategori", verifyToken, verifyOwner, ownerController.getPengeluaranByKategori);
router.get("/grafik-penjualan-menu-hari-ini", verifyToken, verifyOwner, ownerController.getMenuSalesHariIni);
router.get("/grafik-penjualan-menu-bulanan", verifyToken, verifyOwner, ownerController.getMenuSalesBulanan);
router.get("/menu-sales-bulanan", verifyToken, verifyOwner, ownerController.getMenuSalesBulanan);

module.exports = router;
