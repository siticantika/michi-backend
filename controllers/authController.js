const db = require('../config/db');
const bcrypt = require('bcrypt');

// Fungsi login ini adalah titik masuk autentikasi untuk kasir, owner, dan admin.
// Backend menerima username, password, dan role dari frontend, lalu memeriksa kecocokan data di database.
exports.login = async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ message: 'Data tidak lengkap' });
    }

    try {
        // Query ini mencari akun berdasarkan username.
        // Jika tidak ditemukan, sistem langsung menolak login untuk mencegah akses yang tidak sah.
        const [results] = await db.query(  // Ubah ke await, hapus callback
            `SELECT * FROM users WHERE username = ?`,
            [username]
        );

        if (results.length === 0) {
            return res.status(401).json({ message: 'Username atau password salah' });
        }

        const user = results[0];

        // 🔐 Password yang dikirim user dibandingkan dengan password hash di database.
        // Ini penting supaya password asli tidak tersimpan dalam bentuk teks biasa.
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Username atau password salah' });
        }

        // Cek role juga penting karena satu akun bisa saja dipakai oleh role yang berbeda.
        // Sistem memastikan login sesuai dengan hak akses yang diminta, misalnya kasir atau owner.
        if (user.role !== role) {
            return res.status(403).json({ message: 'Role tidak sesuai' });
        }

        res.json({
            message: 'Login berhasil',
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Error in login:', err);  // Tambahkan logging untuk debug
        return res.status(500).json({ message: 'Server error' });
    }
};
