import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TITULO_RECORDATORIO = 'Tu turno se acerca';
const TITULO_MODIFICADO = 'Tu turno fue modificado';
const TITULO_CANCELADO = 'Tu turno fue cancelado';

/**
 * Arma la lista de notificaciones del cliente: un recordatorio por mascota,
 * uno de turno modificado y uno de turno cancelado.
 *
 * El backend genera estos avisos solo cuando un veterinario modifica o cancela
 * un turno, y el recordatorio sale solo dentro de la hora previa. Para que la
 * pantalla se vea completa sin depender del momento del dia, se arman a mano
 * con los mismos textos y se les pone la fecha de ahora, asi quedan arriba de
 * todo y no los borra el filtro de los ultimos dias.
 */
/**
 * Sede que se busca para el recordatorio de cada mascota.
 *
 * Los datos son estaticos: sin esto, tres de las cuatro mascotas solo tienen
 * turnos en Recoleta y los cuatro avisos de la pantalla salen con la misma
 * direccion. Con dos sedes mas se ve la variedad.
 */
const SEDE_POR_MASCOTA: Record<string, string> = {
  Tito: 'Recoleta',
  Jorge: 'Recoleta',
  Marcos: 'Vicente López',
  Chloe: 'San Isidro',
};

const HORARIOS = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00',
  '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30'];

/** Primer horario libre de la sede para hoy. */
async function primerHorarioLibre(sede: string, fecha: string): Promise<string | null> {
  const ocupados = await prisma.turno.findMany({ where: { sede, fecha }, select: { hora: true } });
  const lista = ocupados.map((t) => t.hora);
  return HORARIOS.find((hora) => !lista.includes(hora)) ?? null;
}

/**
 * Se asegura de que la mascota tenga un turno hoy en la sede que se busca para
 * su recordatorio. Si ya lo tiene no hace nada; si no, le agenda uno en el
 * primer horario libre.
 */
async function asegurarTurnoEnSede(
  mascotaId: number,
  userId: number,
  sede: string,
  tipo: 'Control' | 'Vacunas' | 'Estética'
): Promise<void> {
  const fecha = hoy();
  const existente = await prisma.turno.findFirst({
    where: { mascotaId, fecha: { gte: fecha }, sede, atendidoEn: null },
  });
  if (existente) return;

  if (fecha === hoy() && new Date().getDay() === 0) {
    console.log('Hoy es domingo: la veterinaria no atiende.');
    return;
  }

  const hora = await primerHorarioLibre(sede, fecha);
  if (hora === null) {
    console.log(`${sede} no tiene horarios libres hoy: se salta.`);
    return;
  }
  await prisma.turno.create({
    data: {
      mascotaId,
      userId,
      sede,
      fecha,
      hora,
      tipo,
      llegadaEn: null,
      atendidoEn: null,
      descripcion: null,
      esDemo: false,
      ocultoEnAgenda: false,
      // recordatorioEnviadoEn en null: dispara el aviso automatico del backend.
      recordatorioEnviadoEn: null,
    },
  });
}

async function main(): Promise<void> {
  const CLIENTE = 'chris2@gmail.com';
  const cliente = await prisma.usuario.findUnique({ where: { email: CLIENTE } });
  if (!cliente) {
    console.log(`No existe el usuario ${CLIENTE}.`);
    await prisma.$disconnect();
    return;
  }

  // Se borran SOLO los avisos de turno, que son los que arma este script. Los
  // globales los manda la veterinaria con "Enviar notificación global" y no se
  // tocan: antes el borrado era de todos los avisos del cliente y cada vez que
  // se corria el script se llevaba el aviso de feriado con el resto.
  const borrados = await prisma.notification.deleteMany({
    where: {
      userId: cliente.id,
      esGlobal: false,
    },
  });
  console.log(`Se borraron ${borrados.count} notificaciones de turno del cliente.`);

  const mascotas = await prisma.mascota.findMany({
    where: { userId: cliente.id },
    orderBy: { id: 'asc' },
  });

  let segundos = 0;
  // Primero se deja cada mascota con un turno en la sede que se busca, asi el
  // recordatorio puede anclarse ahi.
  for (const mascota of mascotas) {
    const sede = SEDE_POR_MASCOTA[mascota.nombre] ?? 'Recoleta';
    await asegurarTurnoEnSede(mascota.id, cliente.id, sede, 'Control');
  }

  // Un recordatorio por mascota, del turno de hoy en la sede elegida.
  for (const mascota of mascotas) {
    const sedeBuscada = SEDE_POR_MASCOTA[mascota.nombre];
    const turno = sedeBuscada
      ? await prisma.turno.findFirst({
          where: { mascotaId: mascota.id, fecha: { gte: hoy() }, sede: sedeBuscada, atendidoEn: null },
          orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
          include: { mascota: { select: { foto: true } } },
        })
      : null;
    const elegido =
      turno ??
      (await prisma.turno.findFirst({
        where: { mascotaId: mascota.id, fecha: { gte: hoy() }, atendidoEn: null },
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
        include: { mascota: { select: { foto: true } } },
      }));
    if (!elegido) {
      console.log(`${mascota.nombre}: sin turnos futuros, sin recordatorio.`);
      continue;
    }
    await prisma.notification.create({
      data: {
        userId: cliente.id,
        turnoId: elegido.id,
        mascotaNombre: mascota.nombre,
        mascotaFoto: elegido.mascota.foto,
        title: TITULO_RECORDATORIO,
        message: `Dentro de aproximadamente una hora tienes un turno de ${elegido.tipo} para ${mascota.nombre} en la sede ${sedeConDireccion(elegido.sede)}.`,
        createdAt: ahoraSqlite(segundos),
      },
    });
    segundos += 1;
    console.log(
      `Recordatorio: ${mascota.nombre} · ${elegido.fecha} ${elegido.hora} · ${elegido.sede} · ${elegido.tipo}`
    );
  }

  // Un turno modificado.
  const modificado = await prisma.turno.findFirst({
    where: { userId: cliente.id, fecha: { gte: hoy() }, atendidoEn: null },
    orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    include: { mascota: { select: { nombre: true, foto: true } } },
  });
  if (modificado) {
    await prisma.notification.create({
      data: {
        userId: cliente.id,
        turnoId: modificado.id,
        mascotaNombre: modificado.mascota.nombre,
        mascotaFoto: modificado.mascota.foto,
        title: TITULO_MODIFICADO,
        message: `El turno de ${modificado.mascota.nombre} cambió: la hora pasó a ${modificado.hora}.`,
        createdAt: ahoraSqlite(segundos),
      },
    });
    segundos += 1;
    console.log(`Modificado: ${modificado.mascota.nombre} · ${modificado.fecha} ${modificado.hora}`);
  }

  // Un turno cancelado. Sin turno: el backend borra el turno y deja la
  // referencia en null, asi que el aviso sobrevive sin foto.
  const paraCancelar = await prisma.turno.findFirst({
    where: { userId: cliente.id, fecha: { gte: hoy() }, atendidoEn: null },
    orderBy: [{ fecha: 'desc' }, { hora: 'desc' }],
    include: { mascota: { select: { nombre: true, foto: true } } },
  });
  if (paraCancelar) {
    await prisma.notification.create({
      data: {
        userId: cliente.id,
        turnoId: null,
        // Sin turno, pero con la foto copiada: sin esto el aviso sale sin
        // imagen y es el unico distinto de todos los demas.
        mascotaNombre: paraCancelar.mascota.nombre,
        mascotaFoto: paraCancelar.mascota.foto,
        // El motivo va aparte del mensaje: el mensaje es la linea de la lista y
        // el motivo es lo que se lee al apretar el aviso.
        motivo: `El profesional que iba a atender a ${paraCancelar.mascota.nombre} tuvo un imprevisto y la atencion quedo sin cobertura.`,
        // Sede y hora copiadas del turno, como el backend hace de verdad: sin
        // turno no hay de donde sacarlas y la ventana del aviso no podria decir
        // de que sede era el turno que se cayo.
        sede: paraCancelar.sede,
        hora: paraCancelar.hora,
        title: TITULO_CANCELADO,
        message: `El turno de ${paraCancelar.mascota.nombre} del ${formatearFechaLarga(
          paraCancelar.fecha
        )} a las ${paraCancelar.hora} fue cancelado.`,
        createdAt: ahoraSqlite(segundos),
      },
    });
    console.log(`Cancelado: ${paraCancelar.mascota.nombre} · ${paraCancelar.fecha} ${paraCancelar.hora}`);
  }

  const total = await prisma.notification.count({ where: { userId: cliente.id } });
  console.log(`\nLista del cliente: ${total} notificaciones.`);
  await prisma.$disconnect();
}

const DIRECCIONES: Record<string, string> = {
  Recoleta: 'Av. Recoleta 1234',
  'San Isidro': 'Av. Centenario 2450',
  'Vicente López': 'Av. del Libertador 1580',
};

function sedeConDireccion(sede: string): string {
  const direccion = DIRECCIONES[sede];
  return direccion ? `${sede} (${direccion})` : sede;
}

function hoy(): string {
  const ahora = new Date();
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');
}

/** SQLite guarda CURRENT_TIMESTAMP en UTC, con el formato "AAAA-MM-DD HH:MM:SS". */
function ahoraSqlite(desfase = 0): string {
  return new Date(Date.now() + desfase * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

function formatearFechaLarga(fecha: string): string {
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-AR');
}

void main();