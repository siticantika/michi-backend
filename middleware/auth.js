const jwt = require('jsonwebtoken');

// Middleware ini dipakai untuk memastikan user sudah login sebelum membuka endpoint yang dilindungi.
// Token dibaca dari header Authorization, lalu dicek keaslian datanya.
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied' });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid token' });
  }
};

// Middleware ini memastikan hanya user dengan role owner/pemilik yang boleh masuk ke halaman atau endpoint owner.
// Dengan middleware ini, akses ke fitur owner tidak bisa dibuka sembarangan oleh role lain.
const verifyOwner = (req, res, next) => {
  if (req.user.role !== 'owner' && req.user.role !== 'pemilik') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

module.exports = { verifyToken, verifyOwner };