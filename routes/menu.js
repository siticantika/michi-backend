const express = require('express');
const router = express.Router();

const { tambahMenu, updateMenu, deleteMenu } = require('../controllers/menuController');

// Route ini digunakan untuk mengelola data menu dari frontend.
// Menu yang dibuat atau diubah akan langsung dipakai pada halaman kasir untuk transaksi.
router.post('/tambah', tambahMenu);
router.put('/:id', updateMenu);
router.delete('/:id', deleteMenu);

module.exports = router;
