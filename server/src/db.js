import { PrismaClient } from './generated/prisma/index.js';

export const prisma = new PrismaClient();

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
