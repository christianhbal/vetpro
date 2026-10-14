import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HORAS = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00',
  '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'];

function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Deja dos recordatorios de "Tu turno se acerca" listos para probar: uno de
 * Chloe en San Isidro y otro de otra mascota en Recoleta.
 *
 * El backend solo manda el aviso si el turno cae dentro de la proxima hora y si
 * el dueno no es admin (un veterinario atiende, no espera). Por eso Chloe pasa
 * a ser del mismo cliente que ya tiene recordatorios, y los horarios se toman
 * de la ventana que viene; si estan tomados por turnos de ejemplo, se borran
 * esos para liberar el lugar.
 */
async function main(): Promise<void> {
  const ahora = new Date();
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const fecha = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');

  // El cliente es el dueno de los turnos que ya generan recordatorios. Si no se
  // encuentra, el primer usuario que no sea admin.
  const duenoDeEjemplos = await prisma.turno.findFirst({
    where: { esDemo: true, user: { role: { not: 'ADMIN' } } },
    select: { userId: true },
  });
  const cliente = duenoDeEjemplos
    ? await prisma.usuario.findUnique({ where: { id: duenoDeEjemplos.userId } })
    : await prisma.usuario.findFirst({ where: { role: { not: 'ADMIN' } } });
  if (!cliente) {
    console.log('No hay ningun usuario cliente.');
    await prisma.$disconnect();
    return;
  }
  console.log(`Cliente: ${cliente.nombre} (${cliente.email})`);

  const chloe = await prisma.mascota.findFirst({ where: { nombre: 'Chloe' } });
  if (!chloe) {
    console.log('No existe la mascota Chloe.');
    await prisma.$disconnect();
    return;
  }
  await prisma.mascota.update({ where: { id: chloe.id }, data: { userId: cliente.id } });

  const otra = await prisma.mascota.findFirst({
    where: { userId: cliente.id, id: { not: chloe.id }, foto: { not: null } },
    orderBy: { id: 'asc' },
  });
  if (!otra) {
    console.log('El cliente no tiene otra mascota con foto.');
    await prisma.$disconnect();
    return;
  }

  const planes = [
    { mascota: chloe, sede: 'San Isidro', tipo: 'Vacunas' },
    { mascota: otra, sede: 'Recoleta', tipo: 'Control' },
  ];

  for (const plan of planes) {
    const candidatas = HORAS.filter((hora) => {
      const faltan = aMinutos(hora) - minutosAhora;
      return faltan >= 5 && faltan <= 60;
    });

    let elegido: string | null = null;
    for (const hora of candidatas) {
      const ocupado = await prisma.turno.findFirst({
        where: { sede: plan.sede, fecha, hora },
      });
      if (!ocupado) {
        elegido = hora;
        break;
      }
      // Si lo tiene un turno de ejemplo se libera: ese se vuelve a generar con
      // el generador de datos demo.
      if (ocupado.esDemo) {
        await prisma.turno.delete({ where: { id: ocupado.id } });
        elegido = hora;
        console.log(`  Se libero ${plan.sede} ${fecha} ${hora} (estaba con un ejemplo).`);
        break;
      }
    }

    if (elegido === null) {
      console.log(`${plan.sede} no tiene horarios libres en la proxima hora: se salta.`);
      continue;
    }

    await prisma.turno.deleteMany({
      where: { mascotaId: plan.mascota.id, fecha: { gte: fecha }, atendidoEn: null },
    });

    const turno = await prisma.turno.create({
      data: {
        mascotaId: plan.mascota.id,
        userId: cliente.id,
        sede: plan.sede,
        fecha,
        hora: elegido,
        tipo: plan.tipo,
        llegadaEn: null,
        atendidoEn: null,
        descripcion: null,
        esDemo: false,
        ocultoEnAgenda: false,
        // recordatorioEnviadoEn en null: es lo que dispara el aviso automatico.
        recordatorioEnviadoEn: null,
      },
    });
    console.log(`${plan.mascota.nombre}: ${plan.sede}, ${fecha} ${elegido}, ${plan.tipo} (id ${turno.id})`);
  }

  await prisma.notification.deleteMany({
    where: { title: 'Tu turno se acerca', readAt: null },
  });

  console.log('Listo. El backend manda los avisos en menos de un minuto.');
  await prisma.$disconnect();
}

void main();