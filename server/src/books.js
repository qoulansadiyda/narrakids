import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Auth middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Save a book (panels -> book pages)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, roomId, pages } = req.body;
    if (!title || !roomId || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'Missing title, roomId, or pages' });
    }

    const book = await prisma.book.create({
      data: {
        title,
        roomId,
        userId: req.userId,
        pages: {
          create: pages.map((p, idx) => ({
            pageNum: idx,
            objects: JSON.stringify(p.objects ?? []),
          })),
        },
      },
      include: { pages: true },
    });

    res.status(201).json({ ok: true, book });
  } catch (e) {
    console.error('Failed to save book', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all books for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const books = await prisma.book.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        pages: { orderBy: { pageNum: 'asc' }, take: 1 }, // just first page for cover thumbnail
        _count: { select: { pages: true } },
      },
    });
    res.json({ ok: true, books });
  } catch (e) {
    console.error('Failed to fetch books', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single book with all pages
router.get('/:bookId', async (req, res) => {
  try {
    const book = await prisma.book.findUnique({
      where: { id: req.params.bookId },
      include: {
        pages: { orderBy: { pageNum: 'asc' } },
        user: { select: { username: true } },
      },
    });

    if (!book) return res.status(404).json({ error: 'Book not found' });

    // Parse objects back from JSON
    const result = {
      ...book,
      pages: book.pages.map(p => ({
        ...p,
        objects: JSON.parse(p.objects),
      })),
    };

    res.json({ ok: true, book: result });
  } catch (e) {
    console.error('Failed to fetch book', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a book
router.delete('/:bookId', authMiddleware, async (req, res) => {
  try {
    const book = await prisma.book.findUnique({ where: { id: req.params.bookId } });
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    // Delete associated pages first (fallback in case schema cascade isn't robustly defined)
    await prisma.bookPage.deleteMany({ where: { bookId: book.id } });
    // Delete the book itself
    await prisma.book.delete({ where: { id: book.id } });

    res.json({ ok: true });
  } catch (e) {
    console.error('Failed to delete book', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Rename a book
router.patch('/:bookId', authMiddleware, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const book = await prisma.book.findUnique({ where: { id: req.params.bookId } });
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.book.update({
      where: { id: book.id },
      data: { title },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('Failed to rename book', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
