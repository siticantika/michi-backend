const express = require("express");
const db = require("./config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const ownerRoutes = require("./routes/owner");
const keuanganRoutes = require("./routes/keuangan");
const adminRoutes = require("./routes/admin");
const logActivity = require('./utils/logActivity');
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/owner", ownerRoutes);
app.use("/api/keuangan", keuanganRoutes);
app.use("/api/admin", adminRoutes);
app.use("/pengeluaran", require("./routes/pengeluaran"));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Helper function placed in server.js (wrapper calling shared module)
async function logActivityServer(userId, role, nama, aksi) {
  try {
    await logActivity(userId, role, nama, aksi);
  } catch (err) {
    console.error('logActivityServer error:', err && err.message ? err.message : err);
  }
}

/* ======================
   INIT USER DEFAULT
====================== */
async function initKasirDefault() {
  const username = "kasir";
  const password = "kasir123";
  const role = "kasir";

  const [users] = await db.query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );

  if (users.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hash, role]
    );
    console.log("User kasir default dibuat");
  }
}

async function initPemilikDefault() {
  const username = "pemilik";
  const password = "pemilik123";
  const role = "owner"; // ✅ HARUS owner

  const [users] = await db.query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );

  if (users.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hash, role]
    );
    console.log("User pemilik default dibuat");
  }
}

async function initAll() {
  await initKasirDefault();
  await initPemilikDefault();
}

/* ======================
   ROUTES
====================== */
/* ======================
   ROUTES
====================== */
app.use("/api/owner", ownerRoutes);
app.use("/api/keuangan", keuanganRoutes);
app.use("/transaksi", require("./routes/transaksi"));
app.use("/menu", require("./routes/menu"));

/* ======================
  TEST MENU
====================== */
app.get("/tes-menu", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM menu");
  res.json(rows);
});

/* ======================
  LOGIN
====================== */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "Field wajib" });

  const [users] = await db.query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );

  if (users.length === 0)
    return res.status(401).json({ message: "User tidak ditemukan" });

  const valid = await bcrypt.compare(password, users[0].password);
  if (!valid)
    return res.status(401).json({ message: "Password salah" });

  const token = jwt.sign(
    { 
      id: users[0].id, 
      role: users[0].role,
      username: users[0].username
    },
    process.env.JWT_SECRET || "secret"
  );

  // Temporary log to inspect token payload
  try {
    console.log('Token dibuat untuk:', {
      id: users[0].id,
      role: users[0].role,
      username: users[0].username
    });
  } catch (e) {
    // ignore
  }

  // Log activity: login -> set status online
  try {
    const user = users[0];
    try {
      // Langkah 1: Cek apakah ada session lama yang masih online
      const [activeSessions] = await db.query(
        `SELECT id, aksi FROM activity_log 
         WHERE user_id = ? 
         ORDER BY waktu DESC LIMIT 1`,
        [user.id]
      );

      // Langkah 2: Jika ada session lama online, buat baris logout baru
      if (activeSessions.length > 0 && (activeSessions[0].aksi || '').toString().toLowerCase() === 'login') {
        await db.query(
          `INSERT INTO activity_log 
           (user_id, role, nama, aksi, waktu) 
           VALUES (?, ?, ?, 'logout', NOW())`,
          [user.id, user.role, user.username]
        );
        console.log('Session lama ditutup otomatis untuk user:', user.username);
      }

      // Langkah 3: Buat baris login baru
      await db.query(
        `INSERT INTO activity_log 
         (user_id, role, nama, aksi, waktu) 
         VALUES (?, ?, ?, 'login', NOW())`,
        [user.id, user.role, user.username]
      );
      console.log('Login tercatat untuk user:', user.username);
    } catch (e) {
      console.error('Failed to log activity on login:', e.message || e);
    }
  } catch (e) {
    console.error('Failed to log activity on login:', e.message || e);
  }

  res.json({
    message: "Login berhasil",
    token,
    user: {
      id: users[0].id,
      username: users[0].username,
      role: users[0].role,
    },
  });
});

// LOGOUT endpoint - mark activity_log entry as logout/offline for the user
app.post('/api/logout', express.json(), async (req, res) => {
  try {
    console.log('=== LOGOUT ENDPOINT DIPANGGIL ===');
    console.log('Authorization header:', req.headers.authorization);
    console.log('Body:', req.body);
    
    const authHeader = req.headers.authorization;
    const bodyToken = req.body?.token;
    const token = authHeader?.split(' ')[1] || bodyToken;
    
    console.log('Token:', token ? 'ADA' : 'TIDAK ADA');
    
    if (!token) return res.json({ message: 'Logged out' });

    const decoded = jwt.decode(token);
    console.log('Decoded:', decoded);
    
    if (!decoded) return res.json({ message: 'Logged out' });
    
    const userId = decoded.id || decoded.userId;
    console.log('User ID:', userId, 'role from token:', decoded.role, 'username from token:', decoded.username);

    // INSERT baris logout baru menggunakan data dari token
    const [result] = await db.query(
      `INSERT INTO activity_log 
       (user_id, role, nama, aksi, waktu)
       VALUES (?, ?, ?, 'logout', NOW())`,
      [userId, decoded.role || null, decoded.username || null]
    );

    console.log('INSERT logout rows:', result.affectedRows);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message || err);
    res.json({ message: 'Logged out' });
  }
});

// Beacon logout endpoint (used with navigator.sendBeacon)
app.post('/api/logout-beacon', async (req, res) => {
  try {
    console.log('=== BEACON RECEIVED ===');
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        console.log('Beacon body:', bodyStr);
        if (!bodyStr) return res.sendStatus(200);
        const { token } = JSON.parse(bodyStr);
        if (!token) return res.sendStatus(200);
        const decoded = jwt.decode(token);
        if (!decoded) return res.sendStatus(200);
        const userId = decoded.id || decoded.userId;
        console.log('Beacon user ID:', userId, 'role from token:', decoded.role, 'username from token:', decoded.username);
        // INSERT baris logout baru (menggunakan token data)
        const [result] = await db.query(
          `INSERT INTO activity_log 
           (user_id, role, nama, aksi, waktu)
           VALUES (?, ?, ?, 'logout', NOW())`,
          [userId, decoded.role || null, decoded.username || null]
        );
        console.log('Beacon logout inserted:', result.affectedRows);
        res.sendStatus(200);
      } catch (err) {
        console.error('Beacon parse error:', err.message);
        res.sendStatus(200);
      }
    });
  } catch (err) {
    console.error('Beacon error:', err.message);
    res.sendStatus(200);
  }
});

// Endpoint to accept activity logs from frontend (export actions etc.)
app.post('/api/log-aktivitas', express.json(), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.json({ message: 'ok' });
    const decoded = jwt.decode(token);
    if (!decoded) return res.json({ message: 'ok' });
    let { aksi } = req.body;
    if (!aksi) return res.json({ message: 'ok' });

    // Normalize common action text to canonical values
    const aksiLower = (aksi || '').toString().toLowerCase();
    if (aksiLower.includes('transaksi')) {
      aksi = 'tambah transaksi';
    } else if (aksiLower.includes('pengeluaran')) {
      aksi = 'tambah pengeluaran';
    } else if (aksiLower.includes('pemasukan')) {
      aksi = 'tambah pemasukan';
    } else if (aksiLower.includes('export pdf')) {
      aksi = 'export PDF laporan';
    } else if (aksiLower.includes('export excel')) {
      aksi = 'export Excel laporan';
    }

    await logActivityServer(decoded.id || decoded.userId, decoded.role || null, decoded.username || null, aksi);
    res.json({ message: 'ok' });
  } catch (err) {
    console.error('Log-aktivitas error:', err && err.message ? err.message : err);
    res.json({ message: 'ok' });
  }
});

/* ======================
   START SERVER
====================== */
const PORT = process.env.PORT || 3000;;

(async () => {
  try {
    console.log("Initializing database...");
    await initAll();
    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    console.error("Full error:", err);
  }
  console.log("Starting server...");
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
