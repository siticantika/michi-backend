const express = require("express");
const router = express.Router();
const transaksiController = require("../controllers/transaksiController");

const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.post(
  "/",
  upload.single("bukti_qris"),
  transaksiController.tambahTransaksi
);

router.get("/", transaksiController.getTransaksiHariIni);
router.patch('/:id/selesai', transaksiController.setTransaksiSelesai);

module.exports = router;
