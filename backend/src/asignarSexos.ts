import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Sexo de cada mascota ya guardada.
 *
 * Se eligio mirando las fotos: el husky, el boxer y el bull terrier de cabeza
 * ancha son machos; la jirafa, la gata de pelo largo y la siamesa son hembras.
 * Los dos bull terrier de Chloe y Marcos son la misma hembra vista en dos
 * fotos distintas.
 *
 * Esta repartido a mano, no al azar, para que la mitad de las mascotas sean
 * machos y la mitad hembra: asi se ven las dos fichas en la pantalla de la
 * mascota y se puede probar el dato en los dos casos.
 */
const SEXO_POR_MASCOTA: Record<string, 'Macho' | 'Hembra'> = {
  juancho: 'Macho',
  mati: 'Macho',
  jorge: 'Hembra',
  Tito: 'Macho',
  Jorge: 'Macho',
  Chloe: 'Hembra',
  Marcos: 'Hembra',
  Luna: 'Hembra',
  cata: 'Hembra',
  jose: 'Macho',
  ulises: 'Macho',
};

async function main(): Promise<void> {
  const mascotas = await prisma.mascota.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, nombre: true, sexo: true },
  });

  let machos = 0;
  let hembras = 0;
  for (const mascota of mascotas) {
    const sexo = SEXO_POR_MASCOTA[mascota.nombre] ?? 'Macho';
    if (sexo === 'Macho') machos += 1;
    else hembras += 1;
    if (mascota.sexo !== sexo) {
      await prisma.mascota.update({ where: { id: mascota.id }, data: { sexo } });
    }
    console.log(`${mascota.nombre}: ${sexo}`);
  }

  console.log(`\nTotal: ${machos} machos y ${hembras} hembras.`);
  await prisma.$disconnect();
}

void main();
