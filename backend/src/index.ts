import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '..', '.env') });

import cors from 'cors';
import express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { initDatabase } from './initDb';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3000);
const MIN_PASSWORD_LENGTH = 8;
const APPOINTMENT_REMINDER_WINDOW_MS = 60 * 60 * 1000;

// No arrancamos el servidor si PORT no es un puerto valido.
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un numero entero entre 1 y 65535.');
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Convierte el parametro :id a un entero positivo para Prisma.
function parseId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidAppointmentSlot(fecha: string, hora: string): boolean {
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const [hour, minute] = hora.split(':').map(Number);
  const slotMinutes = hour * 60 + minute;
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getDay() >= 1 &&
    date.getDay() <= 6 &&
    date >= hoy &&
    slotMinutes >= 10 * 60 &&
    slotMinutes <= 18 * 60 + 30 &&
    minute % 30 === 0 &&
    (date.getTime() !== hoy.getTime() ||
      slotMinutes > ahora.getHours() * 60 + ahora.getMinutes())
  );
}

// Prisma usa P2025 cuando se intenta actualizar o borrar un registro inexistente.
function isMissingRecord(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

function createAccessToken(userId: number, password: string): string {
  const signature = createHmac('sha256', password).update(`vetpro-admin:${userId}`).digest('hex');
  return `${userId}.${signature}`;
}

async function requireAuthenticatedUser(
  request: express.Request,
  response: express.Response
): Promise<{ id: number; role: string } | null> {
  const token = /^Bearer (\d+)\.([a-f0-9]{64})$/i.exec(
    request.header('authorization') ?? ''
  );
  const userId = token ? parseId(token[1]) : null;
  if (userId === null || !token) {
    response.status(401).json({ message: 'Inicia sesión para continuar.' });
    return null;
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, password: true, role: true },
    });
    if (!user) {
      response.status(401).json({ message: 'Inicia sesión para continuar.' });
      return null;
    }
    const expectedSignature = createAccessToken(user.id, user.password).split('.')[1];
    const receivedSignature = Buffer.from(token[2], 'hex');
    const expectedSignatureBytes = Buffer.from(expectedSignature, 'hex');
    if (
      receivedSignature.length !== expectedSignatureBytes.length ||
      !timingSafeEqual(receivedSignature, expectedSignatureBytes)
    ) {
      response.status(401).json({ message: 'Inicia sesión para continuar.' });
      return null;
    }
    return { id: user.id, role: user.role };
  } catch (error) {
    console.error('No se pudo verificar la autenticación:', error);
    response.status(500).json({ message: 'No se pudo verificar la autenticación.' });
    return null;
  }
}

async function requireAdmin(
  request: express.Request,
  response: express.Response
): Promise<number | null> {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return null;
  if (user.role !== 'ADMIN') {
    response.status(403).json({ message: 'Esta acción requiere una cuenta administradora.' });
    return null;
  }
  return user.id;
}

async function sendPushNotification(
  tokens: string[],
  title: string,
  body: string,
  notificationId: number
): Promise<void> {
  if (tokens.length === 0) return;
  for (let start = 0; start < tokens.length; start += 100) {
    const messages = tokens.slice(start, start + 100).map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: { notificationId },
      channelId: 'default',
    }));
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      throw new Error(`Expo Push API respondió HTTP ${response.status}.`);
    }
    if (
      typeof result === 'object' &&
      result !== null &&
      'data' in result &&
      Array.isArray(result.data)
    ) {
      const failures = result.data.filter(
        (ticket: unknown) =>
          typeof ticket === 'object' &&
          ticket !== null &&
          'status' in ticket &&
          ticket.status === 'error'
      );
      if (failures.length > 0) {
        console.error('Expo rechazó algunas notificaciones push:', failures);
      }
    }
  }
}

async function createUpcomingAppointmentReminders(): Promise<void> {
  const hoy = new Date();
  const fechaActual = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
  const turnos = await prisma.turno.findMany({
    where: { fecha: { gte: fechaActual }, recordatorioEnviadoEn: null },
    include: {
      mascota: { select: { nombre: true } },
    },
  });
  const ahora = Date.now();

  for (const turno of turnos) {
    const inicioTurno = new Date(`${turno.fecha}T${turno.hora}:00`).getTime();
    const tiempoRestante = inicioTurno - ahora;
    if (tiempoRestante <= 0 || tiempoRestante > APPOINTMENT_REMINDER_WINDOW_MS) continue;

    try {
      const notificacion = await prisma.$transaction(async (transaction) => {
        const actualizado = await transaction.turno.updateMany({
          where: {
            id: turno.id,
            fecha: turno.fecha,
            hora: turno.hora,
            recordatorioEnviadoEn: null,
          },
          data: { recordatorioEnviadoEn: new Date().toISOString() },
        });
        if (actualizado.count === 0) return null;

        return transaction.notification.create({
          data: {
            userId: turno.userId,
            turnoId: turno.id,
            title: 'Tu turno se acerca',
            message: `Dentro de aproximadamente una hora tienes un turno de ${turno.tipo} para ${turno.mascota.nombre} en la sede ${turno.sede}.`,
          },
        });
      });
      if (!notificacion) continue;

      try {
        const dispositivos = await prisma.notificacionPush.findMany({
          where: { userId: turno.userId },
          select: { token: true },
        });
        await sendPushNotification(
          dispositivos.map((dispositivo) => dispositivo.token),
          notificacion.title,
          notificacion.message,
          notificacion.id
        );
      } catch (pushError) {
        console.error(
          `El recordatorio del turno ${turno.id} se guardó, pero no se pudo enviar el push:`,
          pushError
        );
      }
    } catch (error) {
      console.error(`No se pudo crear el recordatorio del turno ${turno.id}:`, error);
    }
  }
}
// -----------------------------------------------------------------------------
// 1. Rutas de salud y mascotas
// -----------------------------------------------------------------------------

// GET /api/health
// Confirma que la API y la base de datos estan disponibles.
app.get('/api/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return response.json({ ok: true });
  } catch (error) {
    console.error('La comprobacion de la base de datos fallo:', error);
    return response.status(503).json({ ok: false, message: 'La base de datos no esta disponible.' });
  }
});

// GET /api/mascotas?userId=1
// Devuelve solo las mascotas vinculadas al usuario indicado.
app.get('/api/mascotas', async (request, response) => {
  const userId = parseId(
    typeof request.query.userId === 'string' ? request.query.userId : undefined
  );
  if (userId === null) {
    return response.status(400).json({ message: 'Indica un userId valido.' });
  }

  try {
    const mascotas = await prisma.mascota.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return response.json(mascotas);
  } catch (error) {
    console.error('No se pudieron consultar las mascotas:', error);
    return response.status(500).json({ message: 'No se pudieron consultar las mascotas.' });
  }
});

// POST /api/mascotas
// Valida y guarda una mascota relacionada con su usuario.
app.post('/api/mascotas', async (request, response) => {
  const { nombre, especie, raza, edad, foto, userId } = request.body ?? {};
  const parsedAge = edad === undefined || edad === null || edad === '' ? null : Number(edad);

  if (
    typeof nombre !== 'string' ||
    !nombre.trim() ||
    typeof especie !== 'string' ||
    !especie.trim() ||
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    return response.status(400).json({
      message: 'Ingresa el nombre, la especie y un usuario valido para la mascota.',
    });
  }
  if (raza !== undefined && raza !== null && typeof raza !== 'string') {
    return response.status(400).json({ message: 'La raza no es valida.' });
  }
  if (
    parsedAge !== null &&
    (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 200)
  ) {
    return response.status(400).json({ message: 'La edad debe ser un numero entero entre 0 y 200.' });
  }
  if (
    foto !== undefined &&
    foto !== null &&
    (typeof foto !== 'string' ||
      foto.length > 4_000_000 ||
      !/^data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(foto))
  ) {
    return response.status(400).json({ message: 'La foto no es valida o es demasiado grande.' });
  }

  try {
    const usuarioExiste = await prisma.usuario.findUnique({ where: { id: userId }, select: { id: true } });
    if (!usuarioExiste) {
      return response.status(404).json({ message: 'No se encontro el usuario dueño de la mascota.' });
    }

    const mascota = await prisma.mascota.create({
      data: {
        nombre: nombre.trim(),
        especie: especie.trim(),
        raza: typeof raza === 'string' && raza.trim() ? raza.trim() : null,
        edad: parsedAge,
        foto: foto ?? null,
        user: { connect: { id: userId } },
      },
    });
    return response.status(201).json(mascota);
  } catch (error) {
    console.error('No se pudo crear la mascota:', error);
    return response.status(500).json({ message: 'No se pudo crear la mascota.' });
  }
});

// PATCH /api/mascotas/:id
// Actualiza solamente los campos enviados.
app.patch('/api/mascotas/:id', async (request, response) => {
  const id = parseId(request.params.id);
  const userId = parseId(
    typeof request.body?.userId === 'number' ? String(request.body.userId) : undefined
  );
  if (id === null || userId === null) {
    return response.status(400).json({ message: 'Indica un id de mascota y userId validos.' });
  }

  const { nombre, especie } = request.body ?? {};
  const data: { nombre?: string; especie?: string } = {};

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return response.status(400).json({ message: 'El nombre no es valido.' });
    }
    data.nombre = nombre.trim();
  }
  if (especie !== undefined) {
    if (typeof especie !== 'string' || !especie.trim()) {
      return response.status(400).json({ message: 'La especie no es valida.' });
    }
    data.especie = especie.trim();
  }
  if (Object.keys(data).length === 0) {
    return response.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  try {
    const mascotaPropia = await prisma.mascota.findFirst({ where: { id, userId } });
    if (!mascotaPropia) {
      return response.status(404).json({ message: 'No se encontro la mascota de ese usuario.' });
    }
    const mascota = await prisma.mascota.update({ where: { id }, data });
    return response.json(mascota);
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontro la mascota.' });
    }
    console.error('No se pudo actualizar la mascota:', error);
    return response.status(500).json({ message: 'No se pudo actualizar la mascota.' });
  }
});

// DELETE /api/mascotas/:id
// Elimina una mascota por su id.
app.delete('/api/mascotas/:id', async (request, response) => {
  const id = parseId(request.params.id);
  const userId = parseId(
    typeof request.query.userId === 'string' ? request.query.userId : undefined
  );
  if (id === null || userId === null) {
    return response.status(400).json({ message: 'Indica un id de mascota y userId validos.' });
  }

  try {
    const resultado = await prisma.mascota.deleteMany({ where: { id, userId } });
    if (resultado.count === 0) {
      return response.status(404).json({ message: 'No se encontro la mascota de ese usuario.' });
    }
    return response.status(204).send();
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontro la mascota.' });
    }
    console.error('No se pudo eliminar la mascota:', error);
    return response.status(500).json({ message: 'No se pudo eliminar la mascota.' });
  }
});

// -----------------------------------------------------------------------------
// 2. Rutas de turnos
// -----------------------------------------------------------------------------

const CHECK_IN_QR = 'vetpro://check-in';

// GET /api/turnos/disponibilidad?mes=AAAA-MM&sede=Recoleta
// Devuelve las fechas y horas ocupadas para una sede, sin datos de clientes.
app.get('/api/turnos/disponibilidad', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const mes =
    typeof request.query.mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(request.query.mes)
      ? request.query.mes
      : null;
  if (!mes) {
    return response.status(400).json({ message: 'Indica un mes válido en formato AAAA-MM.' });
  }
  const sede = request.query.sede;
  if (typeof sede !== 'string' || !['Recoleta', 'San Isidro', 'Vicente López'].includes(sede)) {
    return response.status(400).json({ message: 'Indica una sede válida para consultar disponibilidad.' });
  }

  try {
    const turnos = await prisma.turno.findMany({
      // Los turnos de ejemplo no ocupan agenda real.
      where: { fecha: { startsWith: mes }, sede, esDemo: false },
      select: { fecha: true, hora: true },
    });
    return response.json(turnos);
  } catch (error) {
    console.error('No se pudo consultar la disponibilidad de turnos:', error);
    return response.status(500).json({ message: 'No se pudo consultar la disponibilidad.' });
  }
});

// GET /api/turnos?userId=1
// Devuelve los turnos del usuario junto con el nombre de cada mascota.
app.get('/api/turnos', async (request, response) => {
  const userId = parseId(
    typeof request.query.userId === 'string' ? request.query.userId : undefined
  );
  if (userId === null) {
    return response.status(400).json({ message: 'Indica un userId valido.' });
  }

  try {
    const turnos = await prisma.turno.findMany({
      where: { userId },
      include: {
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    return response.json(turnos);
  } catch (error) {
    console.error('No se pudieron consultar los turnos:', error);
    return response.status(500).json({ message: 'No se pudieron consultar los turnos.' });
  }
});

// POST /api/turnos/check-in
// Registra la llegada del usuario al escanear el QR de la veterinaria.
app.post('/api/turnos/check-in', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;
  if (user.role === 'ADMIN') {
    return response.status(403).json({ message: 'El registro de llegada es para cuentas de usuario.' });
  }
  if (request.body?.code !== CHECK_IN_QR) {
    return response.status(400).json({ message: 'El código QR no es válido.' });
  }

  const ahora = new Date();
  const fechaActual = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');

  try {
    const turnoLlegado = await prisma.turno.findFirst({
      where: { userId: user.id, fecha: fechaActual, llegadaEn: { not: null } },
      include: {
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
      orderBy: [{ llegadaEn: 'desc' }, { hora: 'asc' }],
    });
    if (turnoLlegado) {
      return response.json({ turno: turnoLlegado, yaRegistrado: true });
    }

    const turno = await prisma.turno.findFirst({
      where: { userId: user.id, fecha: fechaActual, llegadaEn: null },
      include: {
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
      orderBy: [{ hora: 'asc' }, { id: 'asc' }],
    });
    if (!turno) {
      return response.status(404).json({ message: 'No tienes turnos para hoy.' });
    }

    const llegadaEn = ahora.toISOString();
    const actualizacion = await prisma.turno.updateMany({
      where: { id: turno.id, userId: user.id, llegadaEn: null },
      data: { llegadaEn },
    });
    if (actualizacion.count === 0) {
      return response.status(409).json({ message: 'La llegada de este turno ya fue registrada.' });
    }

    return response.json({
      turno: { ...turno, llegadaEn },
      yaRegistrado: false,
    });
  } catch (error) {
    console.error('No se pudo registrar la llegada del turno:', error);
    return response.status(500).json({ message: 'No se pudo registrar la llegada.' });
  }
});

// POST /api/turnos
// Guarda un turno asociado al dueño y a una de sus mascotas.
app.post('/api/turnos', async (request, response) => {
  const usuario = await requireAuthenticatedUser(request, response);
  if (!usuario) return;
  const { userId, mascotaId, tipo, sede, fecha, hora } = request.body ?? {};

  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    userId !== usuario.id ||
    !Number.isInteger(mascotaId) ||
    mascotaId <= 0
  ) {
    return response.status(400).json({ message: 'Indica un usuario y una mascota validos.' });
  }
  if (typeof tipo !== 'string' || !['Control', 'Vacunas', 'Estética'].includes(tipo)) {
    return response.status(400).json({ message: 'El tipo de turno no es valido.' });
  }
  if (
    typeof sede !== 'string' ||
    !['Recoleta', 'San Isidro', 'Vicente López'].includes(sede)
  ) {
    return response.status(400).json({ message: 'Selecciona una sede válida.' });
  }
  if (!isValidDateOnly(fecha)) {
    return response.status(400).json({ message: 'La fecha debe ser una fecha real en formato AAAA-MM-DD.' });
  }
  if (typeof hora !== 'string' || !isValidAppointmentSlot(fecha, hora)) {
    return response.status(400).json({
      message: 'Elige un horario futuro de lunes a sábado entre las 10:00 y las 18:30, cada media hora.',
    });
  }

  try {
    const mascota = await prisma.mascota.findFirst({
      where: { id: mascotaId, userId },
      select: { id: true },
    });
    if (!mascota) {
      return response.status(404).json({ message: 'La mascota no existe o no pertenece a ese usuario.' });
    }

    const turno = await prisma.$transaction(async (transaction) => {
      const ocupado = await transaction.turno.findFirst({
        where: { fecha, hora, sede },
        select: { id: true },
      });
      if (ocupado) return null;

      return transaction.turno.create({
        data: {
          tipo,
          sede,
          fecha,
          hora,
          user: { connect: { id: userId } },
          mascota: { connect: { id: mascotaId } },
        },
        include: {
          mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
        },
      });
    });
    if (!turno) {
      return response.status(409).json({ message: 'Ese horario acaba de ser ocupado. Elige otro.' });
    }
    return response.status(201).json(turno);
  } catch (error) {
    console.error('No se pudo registrar el turno:', error);
    return response.status(500).json({ message: 'No se pudo registrar el turno.' });
  }
});

// GET /api/admin/turnos
// Lista todos los turnos para su administración.
app.get('/api/admin/turnos', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  try {
    const turnos = await prisma.turno.findMany({
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    return response.json(turnos);
  } catch (error) {
    console.error('No se pudieron consultar los turnos para administración:', error);
    return response.status(500).json({ message: 'No se pudieron consultar los turnos.' });
  }
});

// GET /api/admin/turnos-activos
// Lista los turnos de hoy que ya registraron su llegada por QR y que todavia
// no fueron atendidos.
app.get('/api/admin/turnos-activos', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const ahora = new Date();
  const fechaActual = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');

  try {
    const turnos = await prisma.turno.findMany({
      // Turno activo = ya llego (QR) y todavia no fue atendido. Al completarlo
      // sale de esta lista y pasa a "Turnos completados". Los de ejemplo
      // flotan: aparecen mas alla de la fecha de hoy.
      where: {
        llegadaEn: { not: null },
        atendidoEn: null,
        OR: [{ fecha: fechaActual }, { esDemo: true }],
      },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
      orderBy: [{ llegadaEn: 'desc' }, { hora: 'asc' }],
    });
    return response.json(turnos);
  } catch (error) {
    console.error('No se pudieron consultar los turnos activos:', error);
    return response.status(500).json({ message: 'No se pudieron consultar los turnos activos.' });
  }
});

// Los turnos de ejemplo (esDemo) se borran por consola con
// "npm run db:demo:borrar", no desde la app.

// PATCH /api/admin/turnos/:id/atendido
// Marca el turno como atendido guardando la descripcion de lo que paso.
// Volver a llamarlo actualiza la descripcion. Para desmarcar se envia
// { desmarcar: true }.
app.patch('/api/admin/turnos/:id/atendido', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id del turno no es válido.' });
  }

  const { descripcion, desmarcar } = request.body ?? {};

  if (desmarcar !== undefined && typeof desmarcar !== 'boolean') {
    return response.status(400).json({ message: 'El campo desmarcar debe ser booleano.' });
  }
  // Salir de un turno exige una descripcion de lo que ocurrio.
  if (desmarcar !== true) {
    if (typeof descripcion !== 'string' || !descripcion.trim()) {
      return response
        .status(400)
        .json({ message: 'Escribí una descripción de lo que pasó en el turno.' });
    }
    if (descripcion.trim().length > 500) {
      return response
        .status(400)
        .json({ message: 'La descripción no puede superar los 500 caracteres.' });
    }
  }

  try {
    const turno = await prisma.turno.findUnique({ where: { id }, select: { id: true } });
    if (!turno) {
      return response.status(404).json({ message: 'El turno no existe.' });
    }

    const marca = new Date().toISOString();
    const actualizado = await prisma.turno.update({
      where: { id },
      data:
        desmarcar === true
          ? { atendidoEn: null, descripcion: null }
          : { atendidoEn: marca, descripcion: descripcion.trim() },
      include: {
        user: { select: { id: true, nombre: true, email: true } },
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
    });
    return response.json(actualizado);
  } catch (error) {
    console.error('No se pudo actualizar el estado de atención del turno:', error);
    return response.status(500).json({ message: 'No se pudo marcar el turno como atendido.' });
  }
});

// PATCH /api/admin/turnos/:id
// Permite a un administrador cambiar el tipo, la sede, la fecha o la hora del turno.
app.patch('/api/admin/turnos/:id', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id del turno no es válido.' });
  }
  const { tipo, sede, fecha, hora } = request.body ?? {};
  const data: {
    tipo?: string;
    sede?: string;
    fecha?: string;
    hora?: string;
    recordatorioEnviadoEn?: string | null;
  } = {};

  if (tipo !== undefined) {
    if (typeof tipo !== 'string' || !['Control', 'Vacunas', 'Estética'].includes(tipo)) {
      return response.status(400).json({ message: 'El tipo de turno no es válido.' });
    }
    data.tipo = tipo;
  }
  if (sede !== undefined) {
    if (
      typeof sede !== 'string' ||
      !['Recoleta', 'San Isidro', 'Vicente López'].includes(sede)
    ) {
      return response.status(400).json({ message: 'La sede no es válida.' });
    }
    data.sede = sede;
  }
  if (fecha !== undefined) {
    if (!isValidDateOnly(fecha)) {
      return response.status(400).json({ message: 'La fecha debe ser una fecha real en formato AAAA-MM-DD.' });
    }
    data.fecha = fecha;
  }
  if (hora !== undefined) {
    if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      return response.status(400).json({ message: 'La hora debe tener formato HH:mm.' });
    }
    data.hora = hora;
  }
  if (Object.keys(data).length === 0) {
    return response.status(400).json({ message: 'Indica el tipo, la sede, la fecha o la hora para actualizar.' });
  }

  try {
    const resultado = await prisma.$transaction(async (transaction) => {
      const anterior = await transaction.turno.findUnique({
        where: { id },
        include: { mascota: { select: { nombre: true } } },
      });
      if (!anterior) return null;

      const cambiaHorario =
        (fecha !== undefined && fecha !== anterior.fecha) ||
        (hora !== undefined && hora !== anterior.hora);
      const cambiaDisponibilidad =
        cambiaHorario || (sede !== undefined && sede !== anterior.sede);
      const fechaDestino = fecha ?? anterior.fecha;
      const horaDestino = hora ?? anterior.hora;
      if (cambiaHorario) {
        if (!isValidAppointmentSlot(fechaDestino, horaDestino)) {
          return { validationError: 'invalid' as const };
        }
      }
      if (cambiaDisponibilidad) {
        const sedeDestino = sede ?? anterior.sede;
        const ocupado = await transaction.turno.findFirst({
          where: { id: { not: id }, fecha: fechaDestino, hora: horaDestino, sede: sedeDestino },
          select: { id: true },
        });
        if (ocupado) return { validationError: 'occupied' as const };
      }
      if (cambiaHorario) {
        data.recordatorioEnviadoEn = null;
      }

      const turno = await transaction.turno.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, nombre: true, email: true } },
          mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
        },
      });
      const cambios = [
        anterior.tipo !== turno.tipo ? `tipo: ${anterior.tipo} → ${turno.tipo}` : null,
        anterior.sede !== turno.sede ? `sede: ${anterior.sede} → ${turno.sede}` : null,
        anterior.fecha !== turno.fecha ? `fecha: ${anterior.fecha} → ${turno.fecha}` : null,
        anterior.hora !== turno.hora ? `hora: ${anterior.hora} → ${turno.hora}` : null,
      ].filter((cambio): cambio is string => cambio !== null);

      const notification = cambios.length
        ? await transaction.notification.create({
            data: {
              userId: turno.userId,
              turnoId: turno.id,
              title: 'Tu turno fue modificado',
              message: `El turno de ${anterior.mascota.nombre} cambió: ${cambios.join(', ')}.`,
            },
          })
        : null;

      return { turno, notification };
    });
    if (!resultado) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    if ('validationError' in resultado) {
      return resultado.validationError === 'occupied'
        ? response.status(409).json({ message: 'Ese horario ya está ocupado. Elige otro.' })
        : response.status(400).json({
            message: 'El turno debe ser de lunes a sábado, entre las 10:00 y las 18:30, cada media hora y en el futuro.',
          });
    }

    let pushSent = false;
    if (resultado.notification) {
      try {
        const devices = await prisma.notificacionPush.findMany({
          where: { userId: resultado.turno.userId },
          select: { token: true },
        });
        if (devices.length > 0) {
          await sendPushNotification(
            devices.map((device) => device.token),
            resultado.notification.title,
            resultado.notification.message,
            resultado.notification.id
          );
          pushSent = true;
        }
      } catch (pushError) {
        console.error('El turno se guardó, pero no se pudo enviar el push:', pushError);
      }
    }

    return response.json({
      ...resultado.turno,
      notificationCreated: resultado.notification !== null,
      pushSent,
    });
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    console.error('No se pudo modificar el turno:', error);
    return response.status(500).json({ message: 'No se pudo modificar el turno.' });
  }
});

// GET /api/notifications
// Devuelve los avisos del usuario autenticado, con el total de avisos sin leer.
app.get('/api/notifications', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return response.json({ items, unreadCount });
  } catch (error) {
    console.error('No se pudieron consultar las notificaciones:', error);
    return response.status(500).json({ message: 'No se pudieron consultar las notificaciones.' });
  }
});

// PATCH /api/notifications/:id/read
// Marca como leído un aviso perteneciente al usuario autenticado.
app.patch('/api/notifications/:id/read', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;
  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de la notificación no es válido.' });
  }

  try {
    const result = await prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date().toISOString() },
    });
    if (result.count === 0) {
      const notification = await prisma.notification.findFirst({
        where: { id, userId: user.id },
      });
      if (!notification) {
        return response.status(404).json({ message: 'No se encontró la notificación.' });
      }
      return response.json(notification);
    }
    const notification = await prisma.notification.findUnique({ where: { id } });
    return response.json(notification);
  } catch (error) {
    console.error('No se pudo marcar la notificación como leída:', error);
    return response.status(500).json({ message: 'No se pudo actualizar la notificación.' });
  }
});

// POST /api/push-tokens
// Guarda o actualiza el token push de un dispositivo autenticado.
app.post('/api/push-tokens', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;
  const token = request.body?.token;
  if (
    typeof token !== 'string' ||
    token.length > 512 ||
    !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token)
  ) {
    return response.status(400).json({ message: 'El token de notificaciones push no es válido.' });
  }

  try {
    await prisma.notificacionPush.upsert({
      where: { token },
      create: { token, userId: user.id },
      update: { userId: user.id },
    });
    return response.status(204).send();
  } catch (error) {
    console.error('No se pudo registrar el token push:', error);
    return response.status(500).json({ message: 'No se pudo registrar este dispositivo.' });
  }
});

// -----------------------------------------------------------------------------
// 3. Rutas de registro e inicio de sesion
// -----------------------------------------------------------------------------

// POST /api/users
// Crea una cuenta y guarda la contraseña como texto para el ejercicio de clase.
app.post('/api/users', async (request, response) => {
  const { nombre, email, password, telefono } = request.body ?? {};

  if (
    typeof nombre !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof telefono !== 'string' ||
    !nombre.trim() ||
    !/^\S+@\S+\.\S+$/.test(email.trim()) ||
    password.length < MIN_PASSWORD_LENGTH ||
    !telefono.trim()
  ) {
    return response.status(400).json({ message: 'Revisa el nombre, el correo y la contraseña.' });
  }

  try {
    const user = await prisma.usuario.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        password,
        telefono: telefono.trim(),
      },
      select: { id: true, nombre: true, email: true, telefono: true, createdAt: true },
    });
    return response.status(201).json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return response.status(409).json({ message: 'Ese correo ya esta registrado.' });
    }
    console.error('No se pudo registrar el usuario:', error);
    return response.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
});

// GET /api/admin/users
// Devuelve las cuentas sin incluir sus contraseñas.
app.get('/api/admin/users', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  try {
    const users = await prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        telefono: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
    return response.json(users);
  } catch (error) {
    console.error('No se pudieron consultar los usuarios para administración:', error);
    return response.status(500).json({ message: 'No se pudieron consultar los usuarios.' });
  }
});

// POST /api/admin/users
// Solo un administrador autenticado puede crear otras cuentas administradoras.
app.post('/api/admin/users', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const { nombre, email, telefono } = request.body ?? {};
  if (
    typeof nombre !== 'string' ||
    typeof email !== 'string' ||
    typeof telefono !== 'string' ||
    !nombre.trim() ||
    !/^\S+@\S+\.\S+$/.test(email.trim()) ||
    !telefono.trim()
  ) {
    return response.status(400).json({ message: 'Revisa los datos y el rol del usuario.' });
  }

  try {
    const user = await prisma.usuario.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        password: nombre.trim(),
        telefono: telefono.trim(),
        role: 'ADMIN',
      },
      select: { id: true, nombre: true, email: true, role: true, telefono: true },
    });
    return response.status(201).json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return response.status(409).json({ message: 'Ese correo ya está registrado.' });
    }
    console.error('No se pudo crear el usuario desde administración:', error);
    return response.status(500).json({ message: 'No se pudo crear el usuario.' });
  }
});

// DELETE /api/admin/users/:id
// Evita que un administrador se elimine a sí mismo o quite al último administrador.
app.delete('/api/admin/users/:id', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es válido.' });
  }
  if (id === adminId) {
    return response.status(400).json({ message: 'No puedes eliminar tu propia cuenta.' });
  }

  try {
    const target = await prisma.usuario.findUnique({ where: { id }, select: { role: true } });
    if (!target) {
      return response.status(404).json({ message: 'No se encontró el usuario.' });
    }
    if (
      target.role === 'ADMIN' &&
      (await prisma.usuario.count({ where: { role: 'ADMIN' } })) <= 1
    ) {
      return response.status(400).json({ message: 'No se puede eliminar al último administrador.' });
    }
    await prisma.usuario.delete({ where: { id } });
    return response.status(204).send();
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontró el usuario.' });
    }
    console.error('No se pudo eliminar el usuario:', error);
    return response.status(500).json({ message: 'No se pudo eliminar el usuario.' });
  }
});

// GET /api/users/:id
// Devuelve los datos de perfil, sin contraseña.
app.get('/api/users/:id', async (request, response) => {
  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es valido.' });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, email: true, telefono: true },
    });
    if (!user) {
      return response.status(404).json({ message: 'No se encontro el usuario.' });
    }
    return response.json(user);
  } catch (error) {
    console.error('No se pudo consultar el perfil:', error);
    return response.status(500).json({ message: 'No se pudo consultar el perfil.' });
  }
});

// PATCH /api/users/:id
// Actualiza los datos de contacto opcionales y básicos del usuario.
app.patch('/api/users/:id', async (request, response) => {
  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es valido.' });
  }
  const body = request.body ?? {};
  if (typeof body === 'object' && body !== null && 'email' in body) {
    return response.status(400).json({ message: 'El correo electrónico no se puede modificar.' });
  }
  const { nombre, telefono } = body;
  const data: {
    nombre?: string;
    telefono?: string | null;
  } = {};

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return response.status(400).json({ message: 'El nombre no es valido.' });
    }
    data.nombre = nombre.trim();
  }
  if (telefono !== undefined) {
    if (typeof telefono !== 'string' || !telefono.trim()) {
      return response.status(400).json({ message: 'El telefono es obligatorio.' });
    }
    data.telefono = telefono.trim();
  }
  if (Object.keys(data).length === 0) {
    return response.status(400).json({ message: 'No hay datos de perfil para actualizar.' });
  }
  if (telefono === undefined) {
    return response.status(400).json({ message: 'El telefono es obligatorio.' });
  }

  try {
    const user = await prisma.usuario.update({
      where: { id },
      data,
      select: { id: true, nombre: true, email: true, telefono: true },
    });
    return response.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return response.status(409).json({ message: 'Ese correo ya esta registrado.' });
      }
      if (error.code === 'P2025') {
        return response.status(404).json({ message: 'No se encontro el usuario.' });
      }
    }
    console.error('No se pudo actualizar el perfil:', error);
    return response.status(500).json({ message: 'No se pudo actualizar el perfil.' });
  }
});

// PATCH /api/users/:id/password
// Permite al usuario cambiar su contraseña y revoca el token anterior.
app.patch('/api/users/:id/password', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es válido.' });
  }
  if (user.id !== id) {
    return response.status(403).json({ message: 'Solo puedes cambiar tu propia contraseña.' });
  }

  const { currentPassword, newPassword } = request.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return response.status(400).json({ message: 'Completa la contraseña actual y la nueva.' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return response.status(400).json({
      message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    });
  }

  try {
    const account = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, email: true, telefono: true, password: true },
    });
    if (!account || account.password !== currentPassword) {
      return response.status(400).json({ message: 'La contraseña actual no es correcta.' });
    }
    if (account.password === newPassword) {
      return response.status(400).json({ message: 'La nueva contraseña debe ser diferente.' });
    }

    const updated = await prisma.usuario.update({
      where: { id },
      data: { password: newPassword },
      select: { id: true, nombre: true, email: true, telefono: true, password: true },
    });
    return response.json({
      id: updated.id,
      nombre: updated.nombre,
      email: updated.email,
      telefono: updated.telefono,
      accessToken: createAccessToken(updated.id, updated.password),
    });
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontró el usuario.' });
    }
    console.error('No se pudo cambiar la contraseña:', error);
    return response.status(500).json({ message: 'No se pudo cambiar la contraseña.' });
  }
});

// POST /api/sessions
// Comprueba las credenciales y devuelve los datos publicos del usuario.
app.post('/api/sessions', async (request, response) => {
  const { email, password } = request.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return response.status(400).json({ message: 'Ingresa tu correo y contraseña.' });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || user.password !== password) {
      return response.status(401).json({ message: 'El correo o la contraseña no son correctos.' });
    }

    const accessToken = createAccessToken(user.id, user.password);

    return response.status(200).json({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      telefono: user.telefono,
      esAdmin: user.role === 'ADMIN',
      accessToken,
    });
  } catch (error) {
    console.error('No se pudo iniciar sesion:', error);
    return response.status(500).json({ message: 'No se pudo iniciar sesion.' });
  }
});

// -----------------------------------------------------------------------------
// 4. Arranque del servidor
// -----------------------------------------------------------------------------

export async function start(): Promise<void> {
  await initDatabase();
  await prisma.$connect();
  const reminderTimer = setInterval(() => {
    void createUpcomingAppointmentReminders().catch((error: unknown) => {
      console.error('No se pudieron revisar los recordatorios de turnos:', error);
    });
  }, 60 * 1000);
  reminderTimer.unref();
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`API escuchando en http://0.0.0.0:${port}`);
      void createUpcomingAppointmentReminders().catch((error: unknown) => {
        console.error('No se pudieron revisar los recordatorios de turnos:', error);
      });
      resolve();
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  start().catch(async (error: unknown) => {
    console.error('No se pudo iniciar la API:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
}

export { app, prisma };
