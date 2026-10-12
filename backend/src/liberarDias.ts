import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Tiene que ser la misma marca que usa bloquearDias.ts.
const MARCA = 'ocupado por el ejemplo';

async function main(): Promise<void> {
  // Los que se borran son los que ocuparon la agenda, no los turnos de verdad ni
  // los de historial del generador de ejemplos.
  const liberados = await prisma.turno.deleteMany({
    where: { descripcion: MARCA, ocultoEnAgenda: true },
  });
  console.log(
    liberados.count > 0
      ? `Se liberaron ${liberados.count} horarios. Los turnos de ejemplo y los reales quedaron intactos.`
      : 'No había horarios bloqueados.'
  );
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron liberar los dias bloqueados:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());