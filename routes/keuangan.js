const express = require("express");
const router = express.Router();
const keuanganController = require("../controllers/keuanganController");
const pengeluaranController = require("../controllers/pengeluaranController");
const { verifyToken, verifyOwner } = require("../middleware/auth");


// Route ini mengatur akses ke data pemasukan dan pengeluaran owner.
// Hanya owner yang boleh melihat dan mengubah data finansial ini karena ada middleware verifikasi role.
router.get("/pemasukan",verifyToken, verifyOwner,keuanganController.getPemasukanHariIni);
router.post("/pemasukan",verifyToken, verifyOwner,keuanganController.tambahPemasukan);
router.delete("/:id",verifyToken, verifyOwner,keuanganController.hapusPemasukan);

// Return only today's pengeluaran for owner view; PUT still handled by pengeluaranController
router.get("/pengeluaran", verifyToken, verifyOwner, keuanganController.getPengeluaranHariIni);
router.post("/pengeluaran", verifyToken, verifyOwner, keuanganController.tambahPengeluaran);
router.put("/pengeluaran/:id", verifyToken, verifyOwner, pengeluaranController.update);
router.delete("/:id", verifyToken, verifyOwner, keuanganController.hapusPengeluaran);


module.exports = router;
