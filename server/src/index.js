import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { prisma } from './db.js';
import authRouter from './auth.js';
import booksRouter from './books.js';
import { attachRealtime } from './realtime.js';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const app = express();
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/db/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ db: 'ok' }); }
  catch (e) { res.status(500).json({ db: 'error', message: String(e) }); }
});

app.use('/auth', authRouter);
app.use('/books', booksRouter);

// HTTP + IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET','POST'],
    credentials: true,
  }
});

// pasang handler realtime SETELAH io dibuat
attachRealtime(io);


const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`API+IO on http://localhost:${port}`));
