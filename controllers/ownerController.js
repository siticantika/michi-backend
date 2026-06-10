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

    const totalPengeluaran = Number(pengeluaranKeuangan.total) + Number(pengeluaranKasir.total);

    // include transaksi sales into pemasukan for dashboard
    const totalPemasukanWithSales = Number(pemasukan.total) + Number(transaksiSalesToday.total);


    // transaksi hari ini from keuangan (owner entries)
    // Ambil entri keuangan owner/manual (exclude keuangan baris yang berasal dari transaksi kasir)
    const [transaksiKeuangan] = await db.query(`
      SELECT 
        waktu,
        jenis,
        sumber,
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
    // Representasikan setiap transaksi sales sebagai pemasukan dengan sumber = metode (cash/qris)
    const [transaksiSalesList] = await db.query(`
      SELECT 
        TIME(tanggal) as waktu,
        'pemasukan' as jenis,
        metode as sumber,
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
        keterangan,
        jumlah,
        'kasir' as ditambahkan_oleh
      FROM pengeluaran
      WHERE tanggal = CURDATE()
      ORDER BY waktu DESC
    `);

    // gabungkan transaksi: keuangan owner entries, pengeluaran kasir, and transaksi sales
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
        ditambahkan_oleh
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
        'kasir' as ditambahkan_oleh
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
        ditambahkan_oleh
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
        TIME(tanggal) as waktu,
        UNIX_TIMESTAMP(tanggal) as ts,
        'pemasukan' as jenis,
        metode as sumber,
        CONCAT('Transaksi #', id) as keterangan,
        total as jumlah,
        'kasir' as ditambahkan_oleh
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
      const key = `${minuteKey}||${item.jenis||''}||${item.jumlah||0}||${(item.ditambahkan_oleh||'').toString().trim()}`;
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

    // 🔥 AMBIL DARI JENIS SAJA (NO RELASI ID)
    const [rows] = await db.query(
      `
      SELECT DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal, IFNULL(SUM(jumlah),0) as total
      FROM keuangan
      WHERE jenis = 'pemasukan' AND DATE_FORMAT(tanggal, '%Y-%m') = '2026-01'
      AND (transaksi_id IS NULL OR transaksi_id = 0)
      GROUP BY DATE(tanggal), DATE_FORMAT(tanggal, '%Y-%m-%d')
      `,
      [bulan]
    );

    const map = new Map();

    rows.forEach(r => {
      map.set(r.date, {
        date: r.date,
        pemasukan: Number(r.pemasukan) || 0,
        pengeluaran: Number(r.pengeluaran) || 0
      });
    });

    const days = new Date(year, month, 0).getDate();
    const result = [];

    for (let i = 1; i <= days; i++) {
      const d = String(i).padStart(2, "0");
      const date = `${bulan}-${d}`;

      result.push(map.get(date) || {
        date,
        pemasukan: 0,
        pengeluaran: 0
      });
    }

    res.json({ bulan, data: result });

  } catch (err) {
    console.error("GRAFIK ERROR:", err);
    res.status(500).json({
      message: "Gagal grafik",
      error: err.message
    });
  }
};