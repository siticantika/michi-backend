const express = require("express");
const router = express.Router();
const controller = require("../controllers/pengeluaranController");

// Route ini menghubungkan URL pengeluaran ke controller yang bertugas memproses data.
// Dengan pola ini, frontend hanya perlu memanggil endpoint yang sesuai.
router.get("/", controller.getAll);
router.post("/", controller.create);
router.put("/:id", controller.update);

module.exports = router;
