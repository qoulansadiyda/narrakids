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

const allowedOrigins = [
  CLIENT_URL,
  'https://narrakids-client.vercel.app',
  'http://localhost:3000'
];

const app = express();
app.use(cors({ 
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.some(url => origin.startsWith(url) || url.includes(origin))) {
      callback(null, true);
    } else {
      // Izinkan koneksi dinamis dari vercel branch apa pun (*.vercel.app)
      if (origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  }, 
  credentials: true 
}));
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
    origin: function(origin, callback) {
      if (!origin || allowedOrigins.some(url => origin.startsWith(url) || url.includes(origin))) {
        callback(null, true);
      } else if (origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET','POST'],
    credentials: true,
  }
});

// pasang handler realtime SETELAH io dibuat
attachRealtime(io);


const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`API+IO on http://localhost:${port}`));
