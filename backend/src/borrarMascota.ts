import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/**
 * Mascotas que se borran de la base.
 *
 * Con nombre: hay dos "jorge" en cuentas distintas y borrar por nombre sacaria
 * tambien al del cliente. Con id: no hay forma de tocar al equivocado.
 */
const A_BORRAR: { id: number; nombre: string; dueno: string }[] = [
  { id: 11, nombre: 'jorge', dueno: 'chris@gmail.com' },
];

async function main(): Promise<void> {
  for (const objetivo of A_BORRAR) {
    const mascota = await prisma.mascota.findUnique({
      where: { id: objetivo.id },
      include: { user: { select: { email: true } }, _count: { select: { turnos: true } } },
    });
    if (!mascota) {
      console.log(`#${objetivo.id} ${objetivo.nombre}: ya no existe.`);
      continue;
    }
    if (mascota.user?.email !== objetivo.dueno) {
      throw new Error(
        `#${objetivo.id} ahora es de ${mascota.user?.email ?? 'nadie'} y el script `
          + `esperaba ${objetivo.dueno}. Revisar antes de borrar.`
      );
    }

    // Los turnos se van con la mascota (onDelete: Cascade) y con ellos las
    // notificaciones que los apuntan. Los avisos ya copiaron nombre y foto, asi
    // que el cancelado de jorge sigue mostrandolo.
    await prisma.mascota.delete({ where: { id: objetivo.id } });
    console.log(
      `Borrada #${objetivo.id} ${mascota.nombre} (${mascota.especie}) de ${objetivo.dueno}. `
        + `Se fueron ${mascota._count.turnos} turnos.`
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('No se pudo borrar la mascota:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
