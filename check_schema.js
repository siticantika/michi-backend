const db = require('./config/db');

(async () => {
  try {
    const [rows] = await db.query('DESCRIBE pengeluaran');
    console.log('Schema pengeluaran:');
    rows.forEach(row => {
      console.log(`${row.Field}: ${row.Type} ${row.Null === 'NO' ? 'NOT NULL' : ''}`);
    });
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
})();