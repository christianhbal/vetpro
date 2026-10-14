import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Borra los turnos que no son de ejemplo de Chloe.
 *
 * Los que dejo el script de pruebas (npm run db:chloe) quedan pegados al lado
 * de los del generador y Lauren en dos sedes distintas, que es justo lo que el
 * generador nuevo evita.
 */
async function main(): Promise<void> {
  const chloe = await prisma.mascota.findFirst({ where: { nombre: 'Chloe' } });
  if (!chloe) {
    console.log('No existe Chloe.');
    await prisma.$disconnect();
    return;
  }
  const borrados = await prisma.turno.deleteMany({
    where: { mascotaId: chloe.id, esDemo: false },
  });
  console.log(`Se borraron ${borrados.count} turnos de prueba de Chloe.`);
  await prisma.$disconnect();
}

void main();