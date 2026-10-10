import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const borrados = await prisma.turno.deleteMany({ where: { esDemo: true } });
  console.log(`Se borraron ${borrados.count} turnos de ejemplo. Los reales quedaron intactos.`);
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron borrar los turnos de ejemplo:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());