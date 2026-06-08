const jwt = require('jsonwebtoken');

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

const verifyOwner = (req, res, next) => {
  if (req.user.role !== 'owner' && req.user.role !== 'pemilik') {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

module.exports = { verifyToken, verifyOwner };