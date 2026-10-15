import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { HORARIOS } from './horarios';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/** "14/10/2026", como lo escribe el backend en los mensajes de los avisos. */
function formatearFechaLarga(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

function hoyComoValor(): string {
  const hoy = new Date();
  return [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * El nombre de la mascota sale del propio mensaje del aviso.
 *
 * Los avisos viejos se crearon antes de que la foto quedara copiada en la
 * tabla, asi que la unica fuente que les queda es el texto:
 *
 *   "El turno de mati cambió: hora: 19:00 → 18:00."
 *   "El turno de jorge del 09/10/2026 a las 14:00 fue cancelado."
 */
const NOMBRE_EN_MENSAJE = /turno de (\S+?)\s+(?:del|cambi)/;

/** El mismo motivo corto que usa el backend cuando la veterinaria no escribe uno. */
const MOTIVO_POR_DEFECTO =
  'La veterinaria no pudo sostener la atención en ese horario.';

function nombreDeMascota(mensaje: string): string | null {
  const encontrado = NOMBRE_EN_MENSAJE.exec(mensaje);
  return encontrado ? encontrado[1] : null;
}

async function main(): Promise<void> {
  const avisos = await prisma.notification.findMany({
    orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
    include: {
      user: { select: { email: true } },
      turno: {
        select: { fecha: true, hora: true, mascota: { select: { id: true, nombre: true, foto: true } } },
      },
    },
  });

  // Mascotas de cada dueño, para no resolver un nombre contra la mascota de otro
  // usuario: hay dos "jorge" y son de cuentas distintas.
  const mascotasPorUsuario = new Map<number, { id: number; nombre: string; foto: string | null }[]>();
  for (const mascota of await prisma.mascota.findMany({ where: { userId: { not: null } } })) {
    const lista = mascotasPorUsuario.get(mascota.userId as number) ?? [];
    lista.push({ id: mascota.id, nombre: mascota.nombre, foto: mascota.foto });
    mascotasPorUsuario.set(mascota.userId as number, lista);
  }

  const porBorrar: number[] = [];
  const reparados: string[] = [];

  for (const aviso of avisos) {
    // Con turno el nombre y la foto salen de ahi, sin adivinar nada.
    if (aviso.turnoId !== null && aviso.turno) {
      if (aviso.mascotaNombre === null || aviso.mascotaFoto === null) {
        await prisma.notification.update({
          where: { id: aviso.id },
          data: {
            mascotaNombre: aviso.turno.mascota.nombre,
            mascotaFoto: aviso.turno.mascota.foto,
          },
        });
        reparados.push(`#${aviso.id} ${aviso.user.email}: copiada desde el turno (${aviso.turno.mascota.nombre})`);
      }
      continue;
    }

    // Sin turno (un cancelado borra el suyo) se busca por el nombre del texto,
    // siempre entre las mascotas del mismo dueño.
    const nombre = aviso.mascotaNombre ?? nombreDeMascota(aviso.message);
    const candidatas = mascotasPorUsuario.get(aviso.userId) ?? [];
    const mascota = nombre ? candidatas.find((m) => m.nombre === nombre) : undefined;

    if (!mascota) {
      // No hay de donde sacarle la foto ni que mostrar en la tarjeta. Quedarse
      // sale peor: sale la campanita en medio de las que si tienen foto.
      porBorrar.push(aviso.id);
      continue;
    }

    const datos: {
      mascotaNombre: string;
      mascotaFoto: string | null;
      motivo?: string;
      message?: string;
    } = { mascotaNombre: mascota.nombre, mascotaFoto: mascota.foto };

    if (aviso.title === 'Tu turno fue cancelado') {
      if (!aviso.motivo) datos.motivo = MOTIVO_POR_DEFECTO;
      // El texto viejo decia "fue cancelado por la veterinaria", que ya no
      // dice nada: el motivo va aparte, en la ventana.
      if (aviso.message.includes('por la veterinaria')) {
        datos.message = aviso.message.replace(' fue cancelado por la veterinaria.', ' fue cancelado.');
      }
    }

    await prisma.notification.update({ where: { id: aviso.id }, data: datos });
    reparados.push(`#${aviso.id} ${aviso.user.email}: ${mascota.nombre}${mascota.foto ? ' con foto' : ' sin foto'}`);
  }

  if (porBorrar.length > 0) {
    const borrados = await prisma.notification.deleteMany({ where: { id: { in: porBorrar } } });
    console.log(`\nSe borraron ${borrados.count} avisos que no tenian ni turno ni mascota:`);
    console.log(`  ids ${porBorrar.join(', ')}`);
  }

  console.log('\nAvisos reparados:');
  for (const linea of reparados) console.log(`  ${linea}`);
  if (reparados.length === 0) console.log('  ninguno');

  await armarCanceladosDeAdmin();
}

/**
 * Cada veterinario tiene que ver un aviso de cancelada CON foto.
 *
 * El de arriba se puede borrar cuando la mascota de la que habla ya no esta en
 * la base (se busco el nombre en el texto y no se encontro), y entonces el
 * admin se queda sin ningun cancelado. Este lo arma de verdad: se crea un turno
 * real, se le copia la mascota al aviso y despues se borra el turno, que es
 * exactamente lo que pasa cuando la veterinaria cancela.
 */
async function armarCanceladosDeAdmin(): Promise<void> {
  const admins = await prisma.usuario.findMany({ where: { role: 'ADMIN' } });

  for (const admin of admins) {
    const yaTiene = await prisma.notification.count({
      where: { userId: admin.id, title: 'Tu turno fue cancelado', mascotaFoto: { not: null } },
    });
    if (yaTiene > 0) continue;

    const mascota = await prisma.mascota.findFirst({
      where: { userId: admin.id, foto: { not: null } },
      orderBy: { id: 'asc' },
    });
    if (!mascota) {
      console.log(`\n${admin.email}: no tiene mascotas con foto, no se puede armar el cancelado.`);
      continue;
    }

    // Un turno que no se ve en ninguna pantalla y que existe solo para que el
    // aviso sea real: se crea en el primer horario libre y se borra enseguida.
    const sede = 'Recoleta';
    const fecha = hoyComoValor();
    const ocupados = await prisma.turno.findMany({
      where: { sede, fecha },
      select: { hora: true },
    });
    const hora = HORARIOS.find((h) => !ocupados.some((turno) => turno.hora === h));
    if (!hora) {
      console.log(`\n${admin.email}: no queda horario libre en ${sede} para armar el cancelado.`);
      continue;
    }

    const turno = await prisma.turno.create({
      data: {
        tipo: 'Control',
        sede,
        fecha,
        hora,
        llegadaEn: null,
        atendidoEn: null,
        descripcion: null,
        esDemo: true,
        // No aparece en la agenda: es solo el origen del aviso.
        ocultoEnAgenda: true,
        user: { connect: { id: admin.id } },
        mascota: { connect: { id: mascota.id } },
      },
    });
    await prisma.notification.create({
      data: {
        userId: admin.id,
        turnoId: turno.id,
        mascotaNombre: mascota.nombre,
        mascotaFoto: mascota.foto,
        motivo: `El profesional que iba a atender a ${mascota.nombre} tuvo un imprevisto y la atencion quedo sin cobertura.`,
        // Sede y hora copiadas antes de borrar el turno, como hace el backend.
        sede,
        hora,
        title: 'Tu turno fue cancelado',
        message: `El turno de ${mascota.nombre} del ${formatearFechaLarga(fecha)} a las ${hora} fue cancelado.`,
      },
    });
    // El aviso se queda: al borrarse el turno, la relacion pasa a null y el
    // nombre con la foto ya estan copiados arriba.
    await prisma.turno.delete({ where: { id: turno.id } });

    console.log(`\n${admin.email}: se armó un cancelado de ${mascota.nombre} con foto.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron arreglar los avisos:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
