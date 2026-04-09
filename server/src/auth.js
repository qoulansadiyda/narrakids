import express from 'express';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// input check minimal (biar gak kosong/kependekan)
function invalid(u, p) {
  return !u || !p || u.length < 3 || p.length < 6;
}

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (invalid(username, password)) {
      return res.status(400).json({ error: 'Nama kamu masih kosong atau kata sandi kurang panjang (minimal 6 huruf)' });
    }

    const hashed = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: { username, password: hashed },
      select: { id: true, username: true, createdAt: true }
    });
    res.status(201).json(user);
  } catch (e) {
    // Prisma unique constraint code
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (invalid(username, password)) {
      return res.status(400).json({ error: 'Data yang diisi belum lengkap' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: 'Password kamu salah atau nama belum terdaftar' });

    const ok = await argon2.verify(user.password, password);
    if (!ok) return res.status(401).json({ error: 'Password kamu salah' });

    const token = jwt.sign(
      { sub: user.id, username: user.username },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Tidak ada akses token' });
    const tokenPart = authHeader.split(' ')[1];
    if (!tokenPart) return res.status(401).json({ error: 'Format token salah' });

    let payload;
    try {
      payload = jwt.verify(tokenPart, SECRET);
    } catch {
      return res.status(401).json({ error: 'Token sudah kedaluwarsa, silakan login ulang' });
    }

    const { newUsername } = req.body || {};
    if (!newUsername || newUsername.length < 3) {
      return res.status(400).json({ error: 'Nama pengguna baru minimal 3 karakter' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: payload.sub },
      data: { username: newUsername }
    });

    const newToken = jwt.sign(
      { sub: updatedUser.id, username: updatedUser.username },
      SECRET,
      { expiresIn: '7d' }
    );

    res.json({ ok: true, token: newToken, username: updatedUser.username });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Nama identitas ini sudah terpakai oleh pemain lain' });
    }
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/profile/password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Tidak ada akses token' });
    const tokenPart = authHeader.split(' ')[1];
    if (!tokenPart) return res.status(401).json({ error: 'Format token salah' });

    let payload;
    try {
      payload = jwt.verify(tokenPart, SECRET);
    } catch {
      return res.status(401).json({ error: 'Token sudah kedaluwarsa, silakan login ulang' });
    }

    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Data tidak lengkap atau sandi baru terlalu pendek (minimal 6 karakter)' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });

    const ok = await argon2.verify(user.password, oldPassword);
    if (!ok) return res.status(401).json({ error: 'Kata sandi lama kamu salah nih!' });

    const hashed = await argon2.hash(newPassword, { type: argon2.argon2id });
    await prisma.user.update({
      where: { id: payload.sub },
      data: { password: hashed }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Tidak ada akses token' });
    const tokenPart = authHeader.split(' ')[1];
    if (!tokenPart) return res.status(401).json({ error: 'Format token salah' });

    let payload;
    try {
      payload = jwt.verify(tokenPart, SECRET);
    } catch {
      return res.status(401).json({ error: 'Token sudah kedaluwarsa, silakan login ulang' });
    }

    await prisma.user.delete({
      where: { id: payload.sub }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
