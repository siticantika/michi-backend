const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);

router.get('/test', (req, res) => {
  res.send('AUTH TEST OK');
});

module.exports = router;
console.log('AUTH ROUTE KELOAD');
