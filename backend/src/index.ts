import path from 'node:path';
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

// Prisma usa P2025 cuando se intenta actualizar o borrar un registro inexistente.
function isMissingRecord(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
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
    const usuarioExiste = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
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

// POST /api/turnos
// Guarda un turno asociado al dueño y a una de sus mascotas.
app.post('/api/turnos', async (request, response) => {
  const { userId, mascotaId, tipo, fecha, hora } = request.body ?? {};

  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !Number.isInteger(mascotaId) ||
    mascotaId <= 0
  ) {
    return response.status(400).json({ message: 'Indica un usuario y una mascota validos.' });
  }
  if (typeof tipo !== 'string' || !['Control', 'Vacunas', 'Estética'].includes(tipo)) {
    return response.status(400).json({ message: 'El tipo de turno no es valido.' });
  }
  if (!isValidDateOnly(fecha)) {
    return response.status(400).json({ message: 'La fecha debe ser una fecha real en formato AAAA-MM-DD.' });
  }
  if (typeof hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    return response.status(400).json({ message: 'La hora debe tener formato HH:mm.' });
  }

  try {
    const mascota = await prisma.mascota.findFirst({
      where: { id: mascotaId, userId },
      select: { id: true },
    });
    if (!mascota) {
      return response.status(404).json({ message: 'La mascota no existe o no pertenece a ese usuario.' });
    }

    const turno = await prisma.turno.create({
      data: {
        tipo,
        fecha,
        hora,
        user: { connect: { id: userId } },
        mascota: { connect: { id: mascotaId } },
      },
      include: {
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
    });
    return response.status(201).json(turno);
  } catch (error) {
    console.error('No se pudo registrar el turno:', error);
    return response.status(500).json({ message: 'No se pudo registrar el turno.' });
  }
});

// -----------------------------------------------------------------------------
// 3. Rutas de registro e inicio de sesion
// -----------------------------------------------------------------------------

// POST /api/users
// Crea una cuenta y guarda la contraseña como texto para el ejercicio de clase.
app.post('/api/users', async (request, response) => {
  const { nombre, email, password, telefono, direccion } = request.body ?? {};

  if (
    typeof nombre !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof telefono !== 'string' ||
    !nombre.trim() ||
    !/^\S+@\S+\.\S+$/.test(email.trim()) ||
    password.length < MIN_PASSWORD_LENGTH ||
    !telefono.trim() ||
    (direccion !== undefined && direccion !== null && typeof direccion !== 'string')
  ) {
    return response.status(400).json({ message: 'Revisa el nombre, el correo y la contraseña.' });
  }

  try {
    const user = await prisma.user.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        password,
        telefono: telefono.trim(),
        direccion: typeof direccion === 'string' && direccion.trim() ? direccion.trim() : null,
      },
      select: { id: true, nombre: true, email: true, telefono: true, direccion: true, createdAt: true },
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

// GET /api/users/:id
// Devuelve los datos de perfil, sin contraseña.
app.get('/api/users/:id', async (request, response) => {
  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es valido.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, nombre: true, email: true, telefono: true, direccion: true },
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
  const { nombre, email, telefono, direccion } = request.body ?? {};
  const data: {
    nombre?: string;
    email?: string;
    telefono?: string | null;
    direccion?: string | null;
  } = {};

  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return response.status(400).json({ message: 'El nombre no es valido.' });
    }
    data.nombre = nombre.trim();
  }
  if (email !== undefined) {
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return response.status(400).json({ message: 'El correo no es valido.' });
    }
    data.email = email.trim().toLowerCase();
  }
  if (telefono !== undefined) {
    if (typeof telefono !== 'string' || !telefono.trim()) {
      return response.status(400).json({ message: 'El telefono es obligatorio.' });
    }
    data.telefono = telefono.trim();
  }
  if (direccion !== undefined) {
    if (direccion !== null && typeof direccion !== 'string') {
      return response.status(400).json({ message: 'La direccion no es valida.' });
    }
    data.direccion = typeof direccion === 'string' && direccion.trim() ? direccion.trim() : null;
  }
  if (Object.keys(data).length === 0) {
    return response.status(400).json({ message: 'No hay datos de perfil para actualizar.' });
  }
  if (telefono === undefined) {
    return response.status(400).json({ message: 'El telefono es obligatorio.' });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, nombre: true, email: true, telefono: true, direccion: true },
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

// POST /api/sessions
// Comprueba las credenciales y devuelve los datos publicos del usuario.
app.post('/api/sessions', async (request, response) => {
  const { email, password } = request.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return response.status(400).json({ message: 'Ingresa tu correo y contraseña.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || user.password !== password) {
      return response.status(401).json({ message: 'El correo o la contraseña no son correctos.' });
    }

    return response.status(200).json({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      telefono: user.telefono,
      direccion: user.direccion,
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
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`API escuchando en http://0.0.0.0:${port}`);
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
