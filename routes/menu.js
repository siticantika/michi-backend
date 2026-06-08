const express = require('express');
const router = express.Router();

const { tambahMenu, updateMenu, deleteMenu } = require('../controllers/menuController');

router.post('/tambah', tambahMenu);
router.put('/:id', updateMenu);
router.delete('/:id', deleteMenu);

module.exports = router;
