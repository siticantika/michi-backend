const db = require('../config/db');
const bcrypt = require('bcrypt');

exports.login = async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ message: 'Data tidak lengkap' });
    }

    try {
        const [results] = await db.query(  // Ubah ke await, hapus callback
            `SELECT * FROM users WHERE username = ?`,
            [username]
        );

        if (results.length === 0) {
            return res.status(401).json({ message: 'Username atau password salah' });
        }

        const user = results[0];

        // 🔐 cek password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Username atau password salah' });
        }

        // cek role
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
