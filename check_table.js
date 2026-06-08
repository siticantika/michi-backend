const db = require('./config/db');

(async () => {
  try {
    const [rows] = await db.query('SHOW TABLES LIKE "pengeluaran"');
    console.log('Pengeluaran table exists:', rows.length > 0);

    if (rows.length === 0) {
      console.log('Creating pengeluaran table...');
      await db.query(`
        CREATE TABLE pengeluaran (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tanggal DATE NOT NULL,
          waktu TIME NOT NULL,
          keterangan VARCHAR(255),
          jumlah INT NOT NULL
        )
      `);
      console.log('Pengeluaran table created');
    }
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
})();