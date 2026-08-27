const db = require("../config/db");

exports.getDashboardOwner = async (req, res) => {
  try {
    // total pemasukan hari ini
    // Hitung hanya pemasukan manual/owner di tabel keuangan (exclude rows yang berasal dari transaksi)
    const [[pemasukan]] = await db.query(`
      SELECT IFNULL(SUM(jumlah),0) total
      FROM keuangan
      WHERE jenis = 'pemasukan'
      AND tanggal = CURDATE()
      AND (transaksi_id IS NULL OR transaksi_id = 0)
    `);

    // total transaksi (penjualan) hari ini from transaksi table
    // Data ini diambil dari tabel transaksi karena transaksi kasir merupakan sumber pemasukan utama sistem.
    const [[transaksiSalesToday]] = await db.query(`
      SELECT IFNULL(SUM(total),0) total
      FROM transaksi
      WHERE DATE(tanggal) = CURDATE()
    `);

    // total pengeluaran hari ini (dari keuangan owner + pengeluaran kasir)
    // only count owner-created pengeluaran in keuangan (exclude rows migrated/linked from pengeluaran)
    const [[pengeluaranKeuangan]] = await db.query(`
      SELECT IFNULL(SUM(jumlah),0) total
      FROM keuangan
      WHERE jenis = 'pengeluaran'
      AND tanggal = CURDATE()
      AND (pengeluaran_id IS NULL OR pengeluaran_id = 0)
    `);

    const [[pengeluaranKasir]] = await db.query(`
      SELECT IFNULL(SUM(jumlah),0) total
      FROM pengeluaran
      WHERE tanggal = CURDATE()
    `);

    // Bagian ini adalah logika utama untuk menghitung laba rugi harian.
    // Sistem mengambil data pemasukan dan pengeluaran dari beberapa sumber lalu menghitung selisihnya.
    // Total pengeluaran adalah hasil penjumlahan pengeluaran manual owner dan pengeluaran dari kasir.
    const totalPengeluaran = Number(pengeluaranKeuangan.total) + Number(pengeluaranKasir.total);

    // Bagian ini adalah logika utama untuk menghitung pemasukan harian.
    // Pemasukan berasal dari catatan manual owner ditambah penjualan transaksi kasir.
    const totalPemasukanWithSales = Number(pemasukan.total) + Number(transaksiSalesToday.total);


    // transaksi hari ini from keuangan (owner entries)
    // Ambil entri keuangan owner/manual (exclude keuangan baris yang berasal dari transaksi kasir)
    const [transaksiKeuangan] = await db.query(`
      SELECT 
        waktu,
        jenis,
        sumber,
        kategori_pengeluaran,
        keterangan,
        jumlah,
        ditambahkan_oleh
      FROM keuangan
      WHERE tanggal = CURDATE()
      AND (pengeluaran_id IS NULL OR pengeluaran_id = 0)
      AND (transaksi_id IS NULL OR transaksi_id = 0)
      ORDER BY waktu DESC
    `);

    // transaksi sales (kasir) today from transaksi table
    // Setiap transaksi penjualan diperlakukan sebagai pemasukan dengan sumber metode pembayaran.
    // Ini memudahkan owner melihat bahwa penjualan kasir masuk dalam laporan keuangan.
    const [transaksiSalesList] = await db.query(`
      SELECT 
        COALESCE(waktu, TIME(tanggal)) as waktu,
        'pemasukan' as jenis,
        metode as sumber,
        NULL as kategori_pengeluaran,
        CONCAT('Transaksi #', id) as keterangan,
        total as jumlah,
        'kasir' as ditambahkan_oleh
      FROM transaksi
      WHERE DATE(tanggal) = CURDATE()
      ORDER BY waktu DESC
    `);

    // pengeluaran kasir hari ini
    const [pengeluaranKasirList] = await db.query(`
      SELECT 
        waktu,
        'pengeluaran' as jenis,
        'kasir' as sumber,
        NULL as kategori_pengeluaran,
        keterangan,
        jumlah,
        'kasir' as ditambahkan_oleh
      FROM pengeluaran
      WHERE tanggal = CURDATE()
      ORDER BY waktu DESC
    `);

    // Gabungkan transaksi dari berbagai sumber: catatan manual owner, pengeluaran kasir, dan penjualan kasir.
    // Tujuannya agar halaman dashboard owner menampilkan satu ringkasan yang terintegrasi.
    const transaksi = [...transaksiKeuangan, ...pengeluaranKasirList, ...transaksiSalesList]
      .sort((a, b) => b.waktu.localeCompare(a.waktu));

    res.json({
      pemasukan: totalPemasukanWithSales,
      pengeluaran: totalPengeluaran,
      laba: totalPemasukanWithSales - totalPengeluaran,
      transaksi
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal ambil dashboard owner" });
  }
};

// ===============================
// LAPORAN BULANAN OWNER
// ===============================
exports.getLaporanBulanan = async (req, res) => {
  try {
    const { bulan } = req.query; // contoh: 2025-12

    if (!bulan) {
      return res.status(400).json({ message: "Parameter bulan wajib diisi" });
    }

    // 1️⃣ TOTAL PEMASUKAN BULANAN (keuangan owner + transaksi sales)
    // Hanya hitung pemasukan manual di keuangan (exclude rows yang berasal dari transaksi)
    const [pemasukan] = await db.query(
      `SELECT SUM(jumlah) AS total
       FROM keuangan
       WHERE jenis = 'pemasukan'
       AND DATE_FORMAT(tanggal, '%Y-%m') = ?
       AND (transaksi_id IS NULL OR transaksi_id = 0)`,
      [bulan]
    );

    const [transaksiSales] = await db.query(
      `SELECT IFNULL(SUM(total),0) AS total
       FROM transaksi
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?`,
      [bulan]
    );

    // 2️⃣ TOTAL PENGELUARAN BULANAN (keuangan owner + pengeluaran kasir)
    const [pengeluaranKeuangan] = await db.query(
      `SELECT SUM(jumlah) AS total
       FROM keuangan
       WHERE jenis = 'pengeluaran'
       AND DATE_FORMAT(tanggal, '%Y-%m') = ?
       AND (pengeluaran_id IS NULL OR pengeluaran_id = 0)`,
      [bulan]
    );

    const [pengeluaranKasir] = await db.query(
      `SELECT SUM(jumlah) AS total
       FROM pengeluaran
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?`,
      [bulan]
    );

    // 3️⃣ DETAIL TRANSAKSI BULANAN from keuangan (owner), pengeluaran (kasir), and transaksi (sales)
    const [transaksiKeuangan] = await db.query(
      `SELECT
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        waktu,
        UNIX_TIMESTAMP(CONCAT(tanggal, ' ', waktu)) as ts,
        jenis,
        sumber,
        keterangan,
        jumlah,
        ditambahkan_oleh,
        kategori_pengeluaran
       FROM keuangan
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
       AND (pengeluaran_id IS NULL OR pengeluaran_id = 0)
       AND (transaksi_id IS NULL OR transaksi_id = 0)
       ORDER BY tanggal DESC, waktu DESC`,
      [bulan]
    );

    // pengeluaran kasir bulanan
    const [transaksiKasir] = await db.query(
      `SELECT
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        waktu,
        UNIX_TIMESTAMP(CONCAT(tanggal, ' ', waktu)) as ts,
        'pengeluaran' as jenis,
        'kasir' as sumber,
        keterangan,
        jumlah,
        'kasir' as ditambahkan_oleh,
        NULL as kategori_pengeluaran
       FROM pengeluaran
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
       ORDER BY tanggal DESC, waktu DESC`,
      [bulan]
    );

    // Also include kasir-created rows that were inserted directly into `keuangan`.
    // Some client flows insert pengeluaran into `keuangan` (ditambahkan_oleh='kasir'),
    // so query those explicitly to ensure they appear in the monthly detail.
    const [keuanganKasir] = await db.query(
      `SELECT
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        waktu,
        UNIX_TIMESTAMP(CONCAT(tanggal, ' ', waktu)) as ts,
        jenis,
        sumber,
        keterangan,
        jumlah,
        ditambahkan_oleh,
        kategori_pengeluaran
       FROM keuangan
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
       AND ditambahkan_oleh = 'kasir'
       ORDER BY tanggal DESC, waktu DESC`,
      [bulan]
    );

    // transaksi sales bulanan
    const [transaksiSalesList] = await db.query(
      `SELECT
        DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal,
        COALESCE(waktu, TIME(tanggal)) as waktu,
        UNIX_TIMESTAMP(CONCAT(tanggal, ' ', COALESCE(waktu, '00:00:00'))) as ts,
        'pemasukan' as jenis,
        metode as sumber,
        CONCAT('Transaksi #', id) as keterangan,
        total as jumlah,
        'kasir' as ditambahkan_oleh,
        NULL as kategori_pengeluaran
       FROM transaksi
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
       ORDER BY tanggal DESC, waktu DESC`,
      [bulan]
    );

    // Merge all sources and deduplicate entries that may appear in multiple tables
    const combined = [...transaksiKeuangan, ...transaksiKasir, ...keuanganKasir, ...transaksiSalesList];
    const seen = new Set();
    const transaksi = [];
    combined.forEach(item => {
      // compute numeric timestamp in seconds (prefer item.ts)
      let tsNum = 0;
      if (item && item.ts) tsNum = Number(item.ts);
      else if (item && item.tanggal) {
        // try to build from tanggal + waktu
        try {
          tsNum = Math.floor(new Date(`${item.tanggal} ${item.waktu || '00:00:00'}`).getTime() / 1000);
        } catch (e) {
          tsNum = 0;
        }
      }
      // use minute-granularity to collapse near-duplicate rows that differ only by seconds
      const minuteKey = Math.floor(tsNum / 60);
      const key = `${minuteKey}||${item.jenis||''}||${item.jumlah||0}||${(item.ditambahkan_oleh||'').toString().trim()}||${(item.keterangan||'').toString().trim()}||${(item.kategori_pengeluaran||'').toString().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        transaksi.push(item);
      }
    });
    transaksi.sort((a, b) => {
      const ta = a.ts ? Number(a.ts) : new Date(`${a.tanggal} ${a.waktu}`).getTime();
      const tb = b.ts ? Number(b.ts) : new Date(`${b.tanggal} ${b.waktu}`).getTime();
      return tb - ta;
    });

    // Bagian ini adalah logika laporan bulanan.
    // Data akan difilter berdasarkan bulan yang dipilih, lalu ditampilkan dalam bentuk ringkasan dan detail transaksi.
    // Sistem memfilter data berdasarkan bulan yang dipilih, lalu menjumlahkan pemasukan dan pengeluaran.
    const totalPemasukan = (Number(pemasukan[0].total) || 0) + (Number(transaksiSales[0].total) || 0);
    const totalPengeluaran = (Number(pengeluaranKeuangan[0].total) || 0) + (Number(pengeluaranKasir[0].total) || 0);

    res.json({
      bulan,
      totalPemasukan,
      totalPengeluaran,
      laba: totalPemasukan - totalPengeluaran,
      transaksi
    });

  } catch (error) {
    console.error("ERROR LAPORAN BULANAN:", error);
    res.status(500).json({ message: "Gagal mengambil laporan bulanan" });
  }
};

// ===============================
// Grafik Bulanan (pemasukan & pengeluaran per-hari)
// ===============================

exports.getGrafikBulanan = async (req, res) => {
  try {
    const { bulan } = req.query;

    if (!bulan) {
      return res.status(400).json({ message: "bulan wajib" });
    }

    const [year, month] = bulan.split("-").map(Number);

    // Bagian ini menghitung pemasukan per hari dari tabel keuangan dan tabel transaksi.
    // Data ini dipakai untuk grafik agar owner bisa melihat tren keuangan bulanan.
    const [pemasukanRows] = await db.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') as date, IFNULL(SUM(jumlah),0) as pemasukan
       FROM keuangan
       WHERE jenis = 'pemasukan' AND DATE_FORMAT(tanggal, '%Y-%m') = ?
       AND (transaksi_id IS NULL OR transaksi_id = 0)
       GROUP BY DATE(tanggal), DATE_FORMAT(tanggal, '%Y-%m-%d')`,
      [bulan]
    );

    // Pemasukan dari transaksi kasir per hari
    const [transaksiRows] = await db.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') as date, IFNULL(SUM(total),0) as pemasukan
       FROM transaksi
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
       GROUP BY DATE(tanggal), DATE_FORMAT(tanggal, '%Y-%m-%d')`,
      [bulan]
    );

    // Bagian ini menghitung pengeluaran per hari dari tabel keuangan dan tabel pengeluaran.
    // Nilai ini kemudian digabung dengan data pemasukan untuk membuat grafik bulanan.
    const [pengeluaranRows] = await db.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') as date, IFNULL(SUM(jumlah),0) as pengeluaran
       FROM keuangan
       WHERE jenis = 'pengeluaran' AND DATE_FORMAT(tanggal, '%Y-%m') = ?
       AND (pengeluaran_id IS NULL OR pengeluaran_id = 0)
       GROUP BY DATE(tanggal), DATE_FORMAT(tanggal, '%Y-%m-%d')`,
      [bulan]
    );

    // Pengeluaran kasir per hari
    const [pengeluaranKasirRows] = await db.query(
      `SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') as date, IFNULL(SUM(jumlah),0) as pengeluaran
       FROM pengeluaran
       WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
       GROUP BY DATE(tanggal), DATE_FORMAT(tanggal, '%Y-%m-%d')`,
      [bulan]
    );

    const map = new Map();

    pemasukanRows.forEach(r => {
      const entry = map.get(r.date) || { date: r.date, pemasukan: 0, pengeluaran: 0 };
      entry.pemasukan += Number(r.pemasukan);
      map.set(r.date, entry);
    });

    transaksiRows.forEach(r => {
      const entry = map.get(r.date) || { date: r.date, pemasukan: 0, pengeluaran: 0 };
      entry.pemasukan += Number(r.pemasukan);
      map.set(r.date, entry);
    });

    pengeluaranRows.forEach(r => {
      const entry = map.get(r.date) || { date: r.date, pemasukan: 0, pengeluaran: 0 };
      entry.pengeluaran += Number(r.pengeluaran);
      map.set(r.date, entry);
    });

    pengeluaranKasirRows.forEach(r => {
      const entry = map.get(r.date) || { date: r.date, pemasukan: 0, pengeluaran: 0 };
      entry.pengeluaran += Number(r.pengeluaran);
      map.set(r.date, entry);
    });

    const days = new Date(year, month, 0).getDate();
    const result = [];

    for (let i = 1; i <= days; i++) {
      const d = String(i).padStart(2, "0");
      const date = `${bulan}-${d}`;
      result.push(map.get(date) || { date, pemasukan: 0, pengeluaran: 0 });
    }

    res.json({ bulan, data: result });

  } catch (err) {
    console.error("GRAFIK ERROR:", err);
    res.status(500).json({ message: "Gagal grafik", error: err.message });
  }
};

// New: pengeluaran grouped by kategori for a given month
exports.getPengeluaranByKategori = async (req, res) => {
  try {
    const { bulan } = req.query; // 'YYYY-MM'
    if (!bulan) return res.status(400).json({ message: 'Parameter bulan wajib' });

    // Collect pengeluaran from keuangan (owner entries) and pengeluaran (kasir)
    const [rows] = await db.query(
      `SELECT kategori, SUM(total) as total FROM (
         SELECT IFNULL(kategori_pengeluaran, 'Lainnya') as kategori, jumlah as total
         FROM keuangan
         WHERE jenis = 'pengeluaran'
         AND DATE_FORMAT(tanggal, '%Y-%m') = ?
         AND (pengeluaran_id IS NULL OR pengeluaran_id = 0)
         UNION ALL
         SELECT 'Pengeluaran Kasir' as kategori, jumlah as total
         FROM pengeluaran
         WHERE DATE_FORMAT(tanggal, '%Y-%m') = ?
      ) t
      GROUP BY kategori
      ORDER BY total DESC`,
      [bulan, bulan]
    );

    // Ensure totals are numbers
    const data = (rows || []).map(r => ({ kategori: r.kategori, total: Number(r.total) }));
    res.json({ bulan, data });
  } catch (err) {
    console.error('ERROR getPengeluaranByKategori:', err);
    res.status(500).json({ message: 'Gagal mengambil data pengeluaran per kategori' });
  }
};

exports.getMenuSalesHariIni = async (req, res) => {
  try {
    const filter = (req.query.filter || 'Semua').toString().trim();
    const filterKey = filter.toLowerCase();
    let filterClause = '';
    const params = [];

    if (filterKey !== 'semua') {
      filterClause = 'AND LOWER(t.jenis_harga) = ?';
      params.push(filterKey);
    }

    const [rows] = await db.query(
      `SELECT td.nama_menu AS menu,
              COALESCE(m.icon, '') AS icon,
              SUM(td.jumlah) AS quantity
       FROM transaksi_detail td
       JOIN transaksi t ON td.transaksi_id = t.id
       LEFT JOIN menu m ON td.menu_id = m.id
       WHERE DATE(t.tanggal) = CURDATE()
       ${filterClause}
       GROUP BY td.nama_menu, m.icon
       ORDER BY quantity DESC
       LIMIT 5`,
      params
    );

    const [optionRows] = await db.query(
      `SELECT DISTINCT jenis_harga
       FROM transaksi
       WHERE DATE(tanggal) = CURDATE()
       ORDER BY jenis_harga ASC`
    );

    const options = ['Semua', ...(optionRows || []).map(row => row.jenis_harga).filter(Boolean)];

    const data = (rows || []).map(r => ({
      menu: r.menu || 'Unknown',
      icon: r.icon || '',
      quantity: Number(r.quantity || 0),
    }));

    res.json({
      filter: filterKey === 'semua' ? 'Semua' : filter,
      options,
      data,
    });
  } catch (err) {
    console.error('ERROR getMenuSalesHariIni:', err);
    res.status(500).json({ message: 'Gagal mengambil statistik penjualan menu hari ini' });
  }
};

exports.getMenuSalesBulanan = async (req, res) => {
  try {
    const bulan = (req.query.bulan || '').toString().trim();
    const filter = (req.query.filter || 'Semua').toString().trim();
    const filterKey = filter.toLowerCase();

    if (!bulan || !/^\d{4}-\d{2}$/.test(bulan)) {
      return res.status(400).json({ message: 'Parameter bulan wajib dalam format YYYY-MM' });
    }

    let filterClause = '';
    const params = [bulan];

    if (filterKey !== 'semua') {
      filterClause = 'AND LOWER(t.jenis_harga) = ?';
      params.push(filterKey);
    }

    const [rows] = await db.query(
      `SELECT td.nama_menu AS menu,
              COALESCE(m.icon, '') AS icon,
              SUM(td.jumlah) AS quantity
       FROM transaksi_detail td
       JOIN transaksi t ON td.transaksi_id = t.id
       LEFT JOIN menu m ON td.menu_id = m.id
       WHERE DATE_FORMAT(t.tanggal, '%Y-%m') = ?
       ${filterClause}
       GROUP BY td.nama_menu, m.icon
       ORDER BY quantity DESC
       LIMIT 5`,
      params
    );

    const [optionRows] = await db.query(
      `SELECT DISTINCT t.jenis_harga
       FROM transaksi t
       WHERE DATE_FORMAT(t.tanggal, '%Y-%m') = ?
       ORDER BY t.jenis_harga ASC`,
      [bulan]
    );

    const options = ['Semua', ...(optionRows || []).map(row => row.jenis_harga).filter(Boolean)];

    const data = (rows || []).map(r => ({
      menu: r.menu || 'Unknown',
      icon: r.icon || '',
      quantity: Number(r.quantity || 0),
    }));

    res.json({
      bulan,
      filter: filterKey === 'semua' ? 'Semua' : filter,
      options,
      data,
    });
  } catch (err) {
    console.error('ERROR getMenuSalesBulanan:', err);
    res.status(500).json({ message: 'Gagal mengambil statistik penjualan menu bulanan' });
  }
};