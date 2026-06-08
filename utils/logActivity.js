const db = require('../config/db');

module.exports = async function logActivity(userId, role, nama, aksi) {
  try {
    await db.query(
      `INSERT INTO activity_log (user_id, role, nama, aksi, waktu) 
       VALUES (?, ?, ?, ?, NOW())`,
      [userId || 0, role || '', nama || '', aksi || '']
    );
  } catch (err) {
    console.error('Log activity error:', err && err.message ? err.message : err);
  }
};
