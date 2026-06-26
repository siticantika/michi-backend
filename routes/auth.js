const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route ini menerima request login dari frontend dan meneruskannya ke controller autentikasi.
// Saat user masuk, backend akan memeriksa kredensial dan mengembalikan token jika valid.
router.post('/login', authController.login);

router.get('/test', (req, res) => {
  res.send('AUTH TEST OK');
});

module.exports = router;
console.log('AUTH ROUTE KELOAD');
