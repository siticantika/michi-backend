const bcrypt = require('bcrypt');
const db = require('./config/db'); // sesuaikan dengan koneksi database yang sudah ada

const createAdmin = async () => {
  const username = 'admin';
  const password = 'admin123';
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  await db.query(
    'INSERT INTO admins (username, password) VALUES (?, ?)',
    [username, hashedPassword]
  );
  
  console.log('Admin berhasil dibuat!');
  console.log('Username: admin');
  console.log('Password: admin123');
  process.exit(0);
};

createAdmin().catch(console.error);
