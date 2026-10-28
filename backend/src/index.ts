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
// Titulo del recordatorio de proximidad. Va en una constante porque se usa al
// crearlo y tambien al filtrar la lista: si el texto cambia en un solo lado,
// el filtro deja de pegar con lo guardado.
const TITULO_RECORDATORIO_TURNO = 'Tu turno se acerca';

// No arrancamos el servidor si PORT no es un puerto valido.
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un numero entero entre 1 y 65535.');
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// La API nunca se cachea. Sin esto el navegador revalidaba con If-None-Match y
// Express contestaba 304, o sea que la app seguia dibujando la respuesta vieja:
// la pantalla Turnos mostraba los 15 turnos viejos aunque la base ya estuviera
// filtrada. Sacar las cabeceras de revalidacion de la peticion es lo que corta
// el 304; el Cache-Control solo evita que se guarde.
app.use('/api', (request, response, next) => {
  delete request.headers['if-none-match'];
  delete request.headers['if-modified-since'];
  response.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// Convierte el parametro :id a un entero positivo para Prisma.
function parseId(value: string | undefined): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatearFechaLarga(fecha: string): string {
  const partes = fecha.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fecha;
}

async function sedeConDireccion(sede: string): Promise<string> {
  const registro = await prisma.sede.findUnique({ where: { nombre: sede } });
  return registro ? `${sede} (${registro.direccion})` : sede;
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

function isValidAppointmentSlot(fecha: string, hora: string, sede: { dias: string; horaDesde: string; horaHasta: string }): boolean {
  if (!isValidDateOnly(fecha) || !/^([01]\d|2[0-3]):(00|30)$/.test(hora)) return false;
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dia = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][date.getDay()];
  let dias: unknown;
  try { dias = JSON.parse(sede.dias); } catch { return false; }
  if (!Array.isArray(dias) || !dias.includes(dia)) return false;
  const minutos = (valor: string) => { const [h, m] = valor.split(':').map(Number); return h * 60 + m; };
  const inicio = minutos(hora), desde = minutos(sede.horaDesde), hasta = minutos(sede.horaHasta);
  const [h, m] = hora.split(':').map(Number);
  return inicio >= desde && inicio + 30 <= hasta && (inicio - desde) % 30 === 0 && new Date(year, month - 1, day, h, m) > new Date();
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

async function createUpcomingAppointmentReminders(userId: number): Promise<void> {
  const hoy = new Date();
  const fechaActual = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
  const turnos = await prisma.turno.findMany({
    where: { userId, fecha: { gte: fechaActual }, recordatorioEnviadoEn: null, llegadaEn: null, atendidoEn: null, esDemo: false, ocultoEnAgenda: false },
    include: {
      mascota: { select: { nombre: true, foto: true } },
      // La relacion se llama user, no usuario. El rol se filtra en el where: el
      // recordatorio es para el dueno del turno, que es el que tiene que
      // presentarse. Un admin tambien puede tener turnos propios en la tabla,
      // pero no es cliente: atiende, no espera. Sin este filtro el admin
      // recibia "Tu turno se acerca".
      user: { select: { role: true } },
    },
  });
  const ahora = Date.now();

  for (const turno of turnos) {
    // Los admins no reciben recordatorios de proximity. Se saltea antes de
    // tocar recordatorioEnviadoEn para no marcar el turno como notificado: si
    // un admin tomara el turno de un cliente mas adelante, el recordatorio
    // tendria que salir igual.
    if (turno.user.role === 'ADMIN') continue;

    const inicioTurno = new Date(`${turno.fecha}T${turno.hora}:00`).getTime();
    const tiempoRestante = inicioTurno - ahora;
    if (tiempoRestante <= 0 || tiempoRestante > APPOINTMENT_REMINDER_WINDOW_MS) continue;

    try {
      const sede = await sedeConDireccion(turno.sede);
      await prisma.$transaction(async (transaction) => {
        const actualizado = await transaction.turno.updateMany({
          where: {
            id: turno.id,
            fecha: turno.fecha,
            hora: turno.hora,
            recordatorioEnviadoEn: null,
            llegadaEn: null, atendidoEn: null, esDemo: false, ocultoEnAgenda: false,
          },
          data: { recordatorioEnviadoEn: new Date().toISOString() },
        });
        if (actualizado.count === 0) return null;

        return transaction.notification.create({
          data: {
            userId: turno.userId,
            turnoId: turno.id,
            mascotaNombre: turno.mascota.nombre,
            mascotaFoto: turno.mascota.foto,
            title: TITULO_RECORDATORIO_TURNO,
            message: `Dentro de aproximadamente una hora tienes un turno de ${turno.tipo} para ${turno.mascota.nombre} en la sede ${sede}.`,
          },
        });
      });
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
// Sexo de una mascota. El POST y el PATCH validan contra esta misma lista: si
// cada uno escribiera la suya, el POST podria aceptar un valor que el PATCH
// rechaza y la mascota quedaria guardada con un sexo que la app no muestra.
const SEXOS_MASCOTA = ['Macho', 'Hembra'];

app.get('/api/health', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return response.json({ ok: true });
  } catch (error) {
    console.error('La comprobacion de la base de datos fallo:', error);
    return response.status(503).json({ ok: false, message: 'La base de datos no esta disponible.' });
  }
});

// Las sedes se consultan con sesión; solo un administrador puede modificarlas.
app.get('/api/sedes', async (request, response) => {
  if (!(await requireAuthenticatedUser(request, response))) return;
  try {
    const sedes = await prisma.sede.findMany({ orderBy: { nombre: 'asc' } });
    return response.json(sedes.map((sede) => ({ ...sede, dias: JSON.parse(sede.dias) })));
  } catch (error) {
    console.error('No se pudieron consultar las sedes:', error);
    return response.status(500).json({ message: 'No se pudieron consultar las sedes.' });
  }
});

async function guardarSede(request: express.Request, response: express.Response): Promise<void> {
  if ((await requireAdmin(request, response)) === null) return;
  const id = typeof request.params.id === 'string' ? parseId(request.params.id) : null;
  if (request.params.id !== undefined && id === null) {
    response.status(400).json({ message: 'El id de sede no es válido.' }); return;
  }
  const { nombre, direccion, dias, horaDesde, horaHasta } = request.body ?? {};
  const diasValidos = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const horaValida = (valor: unknown): valor is string =>
    typeof valor === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(valor);
  if (typeof nombre !== 'string' || nombre.trim().length < 3 ||
      typeof direccion !== 'string' || !direccion.trim() || !Array.isArray(dias) ||
      dias.length === 0 || !dias.every((dia: unknown) => typeof dia === 'string' && diasValidos.includes(dia)) ||
      new Set(dias).size !== dias.length || !horaValida(horaDesde) || !horaValida(horaHasta) || horaDesde >= horaHasta) {
    response.status(400).json({ message: 'Revisa nombre, dirección, días y horarios de la sede.' }); return;
  }
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const repetida = await tx.sede.findFirst({ where: { nombre: nombre.trim(), ...(id === null ? {} : { id: { not: id } }) } });
      if (repetida) return 'duplicada' as const;
      const data = { nombre: nombre.trim(), direccion: direccion.trim(), dias: JSON.stringify(dias), horaDesde, horaHasta };
      if (id === null) return tx.sede.create({ data });
      const anterior = await tx.sede.findUnique({ where: { id } });
      if (!anterior) return null;
      const sede = await tx.sede.update({ where: { id }, data });
      if (anterior.nombre !== sede.nombre) {
        await tx.turno.updateMany({ where: { sede: anterior.nombre }, data: { sede: sede.nombre } });
        await tx.notification.updateMany({ where: { sede: anterior.nombre }, data: { sede: sede.nombre } });
      }
      return sede;
    });
    if (resultado === 'duplicada') { response.status(409).json({ message: 'Ya existe una sede con ese nombre.' }); return; }
    if (!resultado) { response.status(404).json({ message: 'No se encontró la sede.' }); return; }
    response.status(id === null ? 201 : 200).json({ ...resultado, dias: JSON.parse(resultado.dias) });
  } catch (error) {
    console.error('No se pudo guardar la sede:', error);
    response.status(500).json({ message: 'No se pudo guardar la sede.' });
  }
}

app.post('/api/admin/sedes', guardarSede);
app.patch('/api/admin/sedes/:id', guardarSede);
app.delete('/api/admin/sedes/:id', async (request, response) => {
  if ((await requireAdmin(request, response)) === null) return;
  const id = parseId(request.params.id);
  if (id === null) return response.status(400).json({ message: 'El id de sede no es válido.' });
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const sede = await tx.sede.findUnique({ where: { id } });
      if (!sede) return 'no-existe';
      if (await tx.turno.count({ where: { sede: sede.nombre } })) return 'tiene-turnos';
      await tx.sede.delete({ where: { id } });
      return 'eliminada';
    });
    if (resultado === 'no-existe') return response.status(404).json({ message: 'No se encontró la sede.' });
    if (resultado === 'tiene-turnos') return response.status(409).json({ message: 'La sede tiene turnos asociados y no se puede eliminar.' });
    return response.status(204).send();
  } catch (error) {
    console.error('No se pudo eliminar la sede:', error);
    return response.status(500).json({ message: 'No se pudo eliminar la sede.' });
  }
});

// GET /api/mascotas?userId=1
// Devuelve solo las mascotas vinculadas al usuario indicado.
app.get('/api/mascotas', async (request, response) => {
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const userId = parseId(
    typeof request.query.userId === 'string' ? request.query.userId : undefined
  );
  if (userId === null) {
    return response.status(400).json({ message: 'Indica un userId valido.' });
  }

  if (userId !== autenticado.id) return response.status(403).json({ message: 'No puedes acceder a datos de otro usuario.' });

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
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const { nombre, especie, raza, sexo, edad, foto, userId } = request.body ?? {};
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
  if (userId !== autenticado.id) return response.status(403).json({ message: 'No puedes crear mascotas para otro usuario.' });

  if (raza !== undefined && raza !== null && typeof raza !== 'string') {
    return response.status(400).json({ message: 'La raza no es valida.' });
  }
  if (sexo !== undefined && sexo !== null && !SEXOS_MASCOTA.includes(String(sexo))) {
    return response.status(400).json({ message: 'El sexo tiene que ser Macho o Hembra.' });
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
        sexo: SEXOS_MASCOTA.includes(String(sexo)) ? String(sexo) : null,
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
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const id = parseId(request.params.id);
  const userId = parseId(
    typeof request.body?.userId === 'number' ? String(request.body.userId) : undefined
  );
  if (id === null || userId === null) {
    return response.status(400).json({ message: 'Indica un id de mascota y userId validos.' });
  }

  if (userId !== autenticado.id) return response.status(403).json({ message: 'No puedes acceder a datos de otro usuario.' });

  const { nombre, especie, raza, sexo, edad, foto } = request.body ?? {};
  const parsedAge = edad === undefined ? undefined : edad === null || edad === '' ? null : Number(edad);
  const data: {
    nombre?: string;
    especie?: string;
    raza?: string | null;
    sexo?: string | null;
    edad?: number | null;
    foto?: string | null;
  } = {};

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
  if (raza !== undefined) {
    if (raza !== null && typeof raza !== 'string') {
      return response.status(400).json({ message: 'La raza no es valida.' });
    }
    data.raza = typeof raza === 'string' && raza.trim() ? raza.trim() : null;
  }
  if (sexo !== undefined) {
    if (sexo !== null && !SEXOS_MASCOTA.includes(String(sexo))) {
      return response.status(400).json({ message: 'El sexo tiene que ser Macho o Hembra.' });
    }
    data.sexo = SEXOS_MASCOTA.includes(String(sexo)) ? String(sexo) : null;
  }
  if (parsedAge !== undefined) {
    if (
      parsedAge !== null &&
      (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 200)
    ) {
      return response
        .status(400)
        .json({ message: 'La edad debe ser un numero entero entre 0 y 200.' });
    }
    data.edad = parsedAge;
  }
  if (foto !== undefined) {
    if (
      foto !== null &&
      (typeof foto !== 'string' ||
        foto.length > 4_000_000 ||
        !/^data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(foto))
    ) {
      return response
        .status(400)
        .json({ message: 'La foto no es valida o es demasiado grande.' });
    }
    data.foto = foto;
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
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const id = parseId(request.params.id);
  const userId = parseId(
    typeof request.query.userId === 'string' ? request.query.userId : undefined
  );
  if (id === null || userId === null) {
    return response.status(400).json({ message: 'Indica un id de mascota y userId validos.' });
  }

  if (userId !== autenticado.id) return response.status(403).json({ message: 'No puedes acceder a datos de otro usuario.' });

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

const PREFIJO_CHECK_IN = 'vetpro://check-in';

/**
 * Extrae la sede de un QR de llegada `vetpro://check-in?sede=Recoleta`.
 * Devuelve null si el QR no es de VetPro o si la sede no existe.
 */
async function sedeDeCheckIn(code: unknown): Promise<string | null> {
  if (typeof code !== 'string') return null;
  const [base, consulta] = code.split('?');
  if (base !== PREFIJO_CHECK_IN) return null;
  const params = new URLSearchParams(consulta ?? '');
  const id = parseId(params.get('sedeId') ?? undefined);
  const nombre = params.get('sede');
  const sede = id !== null ? await prisma.sede.findUnique({ where: { id } }) : nombre ? await prisma.sede.findUnique({ where: { nombre } }) : null;
  return sede?.nombre ?? null;
}

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
  if (typeof sede !== 'string' || !(await prisma.sede.findUnique({ where: { nombre: sede } }))) {
    return response.status(400).json({ message: 'Indica una sede válida para consultar disponibilidad.' });
  }

  try {
    const turnos = await prisma.turno.findMany({
      where: { fecha: { startsWith: mes }, sede },
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
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const userId = parseId(
    typeof request.query.userId === 'string' ? request.query.userId : undefined
  );
  if (userId === null) {
    return response.status(400).json({ message: 'Indica un userId valido.' });
  }

  if (userId !== autenticado.id) return response.status(403).json({ message: 'No puedes acceder a datos de otro usuario.' });

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

// DELETE /api/turnos/:id
// El dueño cancela su propio turno.
//
// Es distinto del DELETE del admin (que cancela el turno de cualquiera y le
// avisa al dueño con un motivo): acá no se manda aviso porque el aviso le
// llegaria a la misma persona que lo pidió. La agenda del veterinario lo ve
// desaparecer, que es lo que tiene que pasar.
app.delete('/api/turnos/:id', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id del turno no es válido.' });
  }

  try {
    const turno = await prisma.turno.findFirst({
      where: { id, userId: user.id },
      select: { id: true, atendidoEn: true, llegadaEn: true },
    });
    // findFirst y no findUnique: un turno de otro tiene que ser un 404, no un
    // permiso que le diga al usuario que el turno existe.
    if (!turno) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    if (turno.atendidoEn) {
      return response.status(409).json({ message: 'Ese turno ya fue atendido.' });
    }
    if (turno.llegadaEn) {
      return response
        .status(409)
        .json({ message: 'Ya te presentaste en la sede, el turno no se puede cancelar.' });
    }

    await prisma.turno.delete({ where: { id: turno.id } });
    return response.json({ id: turno.id, cancelado: true });
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    console.error('No se pudo cancelar el turno del cliente:', error);
    return response.status(500).json({ message: 'No se pudo cancelar el turno.' });
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

  const sede = await sedeDeCheckIn(request.body?.code);
  if (sede === null) {
    return response.status(400).json({ message: 'El código QR no es válido.' });
  }

  const ahora = new Date();
  const fechaActual = [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, '0'),
    String(ahora.getDate()).padStart(2, '0'),
  ].join('-');

  try {
    const turno = await prisma.turno.findFirst({
      where: { userId: user.id, fecha: fechaActual, sede, llegadaEn: null, atendidoEn: null, esDemo: false, ocultoEnAgenda: false },
      include: {
        mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
      },
      orderBy: [{ hora: 'asc' }, { id: 'asc' }],
    });
    if (!turno) {
      return response.status(404).json({
        message: `No tienes turnos para hoy en ${await sedeConDireccion(sede)}.`,
      });
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
      sede,
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
    !(await prisma.sede.findUnique({ where: { nombre: sede } }))
  ) {
    return response.status(400).json({ message: 'Selecciona una sede válida.' });
  }
  if (!isValidDateOnly(fecha)) {
    return response.status(400).json({ message: 'La fecha debe ser una fecha real en formato AAAA-MM-DD.' });
  }
  const sedeConfigurada = await prisma.sede.findUnique({ where: { nombre: sede } });
  if (typeof hora !== 'string' || !sedeConfigurada || !isValidAppointmentSlot(fecha, hora, sedeConfigurada)) {
    return response.status(400).json({
      message: 'Elige un horario futuro dentro de los días y horarios de atención de la sede.',
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
      const configuracion = await transaction.sede.findUnique({ where: { nombre: sede } });
      if (!configuracion || !isValidAppointmentSlot(fecha, hora, configuracion)) return 'horario-invalido' as const;
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
    if (turno === 'horario-invalido') {
      return response.status(400).json({ message: 'El horario ya no está disponible en esta sede.' });
    }
    if (!turno) {
      return response.status(409).json({ message: 'Ese horario acaba de ser ocupado. Elige otro.' });
    }
    return response.status(201).json(turno);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return response.status(409).json({ message: 'Ese horario acaba de ser ocupado. Elige otro.' });
    console.error('No se pudo registrar el turno:', error);
    return response.status(500).json({ message: 'No se pudo registrar el turno.' });
  }
});

// POST /api/admin/turnos
// Agenda el turno de seguimiento de una mascota que es de un cliente. El
// dueño se resuelve desde la mascota: el admin solo elige el horario, asi que
// no puede inventarse a nombre de otra persona.
app.post('/api/admin/turnos', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;
  const { mascotaId, tipo, sede, fecha, hora } = request.body ?? {};

  if (!Number.isInteger(mascotaId) || mascotaId <= 0) {
    return response.status(400).json({ message: 'Indica una mascota válida.' });
  }
  if (typeof tipo !== 'string' || !['Control', 'Vacunas', 'Estética'].includes(tipo)) {
    return response.status(400).json({ message: 'El tipo de turno no es valido.' });
  }
  if (
    typeof sede !== 'string' ||
    !(await prisma.sede.findUnique({ where: { nombre: sede } }))
  ) {
    return response.status(400).json({ message: 'Selecciona una sede válida.' });
  }
  if (!isValidDateOnly(fecha)) {
    return response
      .status(400)
      .json({ message: 'La fecha debe ser una fecha real en formato AAAA-MM-DD.' });
  }
  const sedeConfigurada = await prisma.sede.findUnique({ where: { nombre: sede } });
  if (typeof hora !== 'string' || !sedeConfigurada || !isValidAppointmentSlot(fecha, hora, sedeConfigurada)) {
    return response.status(400).json({
      message: 'Elige un horario futuro dentro de los días y horarios de atención de la sede.',
    });
  }

  try {
    const mascota = await prisma.mascota.findFirst({
      where: { id: mascotaId, userId: { not: null } },
      select: { id: true, userId: true },
    });
    if (!mascota || mascota.userId === null) {
      return response.status(404).json({ message: 'La mascota no existe o no tiene dueño.' });
    }
    // Se copia el id a una constante porque TypeScript no mantiene el
    // estrechamiento de una propiedad dentro del closure de la transaccion.
    const duenoId = mascota.userId;

    const turno = await prisma.$transaction(async (transaction) => {
      const configuracion = await transaction.sede.findUnique({ where: { nombre: sede } });
      if (!configuracion || !isValidAppointmentSlot(fecha, hora, configuracion)) return 'horario-invalido' as const;
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
          user: { connect: { id: duenoId } },
          mascota: { connect: { id: mascota.id } },
        },
        include: {
          mascota: { select: { id: true, nombre: true, especie: true, raza: true, foto: true } },
        },
      });
    });
    if (turno === 'horario-invalido') {
      return response.status(400).json({ message: 'El horario ya no está disponible en esta sede.' });
    }
    if (!turno) {
      return response.status(409).json({ message: 'Ese horario acaba de ser ocupado. Elige otro.' });
    }
    return response.status(201).json(turno);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return response.status(409).json({ message: 'Ese horario acaba de ser ocupado. Elige otro.' });
    console.error('No se pudo agendar el turno de seguimiento:', error);
    return response
      .status(500)
      .json({ message: 'No se pudo agendar el turno de seguimiento.' });
  }
});

// GET /api/admin/turnos
// Lista todos los turnos para su administración.
// GET /api/admin/turnos
// Por defecto no devuelve los turnos fuera de agenda (los dias completos y el
// historial): son Hundreds de filas que solo ocupan un horario. El Historial los
// necesita, asi que los pide con ?incluirOcultos=1.
app.get('/api/admin/turnos', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const incluirOcultos = request.query.incluirOcultos === '1';

  try {
    const turnos = await prisma.turno.findMany({
      where: incluirOcultos ? undefined : { ocultoEnAgenda: false },
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
        // Los turnos fuera de agenda (dias completos, historial) nunca estan
        // esperando: solo ocupan un horario o son de dias pasados.
        ocultoEnAgenda: false,
        fecha: fechaActual,
        esDemo: false,
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

// Completa la atención y el seguimiento en la misma transacción.
app.patch('/api/admin/turnos/:id/atendido', async (request, response) => {
  if ((await requireAdmin(request, response)) === null) return;
  const id = parseId(request.params.id);
  if (id === null) return response.status(400).json({ message: 'El id del turno no es válido.' });
  const { descripcion, seguimiento, desmarcar } = request.body ?? {};
  if (desmarcar !== undefined) return response.status(400).json({ message: 'Una atención no se puede desmarcar.' });
  if (typeof descripcion !== 'string' || !descripcion.trim() || descripcion.trim().length > 500) return response.status(400).json({ message: 'Escribí una descripción de hasta 500 caracteres.' });
  if (seguimiento !== undefined && seguimiento !== null && (typeof seguimiento !== 'object' || !['Control', 'Vacunas', 'Estética'].includes(seguimiento.tipo) || typeof seguimiento.sede !== 'string' || !isValidDateOnly(seguimiento.fecha) || typeof seguimiento.hora !== 'string')) return response.status(400).json({ message: 'Los datos del seguimiento no son válidos.' });
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const actual = await tx.turno.findUnique({ where: { id } });
      if (!actual) return { error: 'no-existe' as const };
      if (actual.atendidoEn || !actual.llegadaEn || actual.esDemo || actual.ocultoEnAgenda) return { error: 'estado' as const };
      if (seguimiento) {
        if (seguimiento.sede !== actual.sede) return { error: 'sede' as const };
        const sede = await tx.sede.findUnique({ where: { nombre: seguimiento.sede } });
        if (!sede || !isValidAppointmentSlot(seguimiento.fecha, seguimiento.hora, sede)) return { error: 'horario' as const };
        const ocupado = await tx.turno.findFirst({ where: { sede: seguimiento.sede, fecha: seguimiento.fecha, hora: seguimiento.hora } });
        if (ocupado) return { error: 'ocupado' as const };
      }
      const actualizado = await tx.turno.updateMany({ where: { id, atendidoEn: null, llegadaEn: { not: null } }, data: { atendidoEn: new Date().toISOString(), descripcion: descripcion.trim() } });
      if (actualizado.count !== 1) return { error: 'estado' as const };
      const nuevo = seguimiento ? await tx.turno.create({ data: { tipo: seguimiento.tipo, sede: seguimiento.sede, fecha: seguimiento.fecha, hora: seguimiento.hora, userId: actual.userId, mascotaId: actual.mascotaId } }) : null;
      return { turno: await tx.turno.findUnique({ where: { id } }), seguimiento: nuevo };
    });
    if ('error' in resultado) {
      if (resultado.error === 'no-existe') return response.status(404).json({ message: 'El turno no existe.' });
      if (resultado.error === 'estado') return response.status(409).json({ message: 'El turno ya fue atendido o todavía no registró su llegada.' });
      if (resultado.error === 'ocupado') return response.status(409).json({ message: 'El horario del seguimiento ya está ocupado.' });
      return response.status(400).json({ message: 'Revisá la sede y el horario del seguimiento.' });
    }
    return response.json(resultado);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return response.status(409).json({ message: 'El horario del seguimiento ya está ocupado.' });
    console.error('No se pudo completar la atención:', error);
    return response.status(500).json({ message: 'No se pudo completar la atención.' });
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
      !(await prisma.sede.findUnique({ where: { nombre: sede } }))
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
        include: { mascota: { select: { nombre: true, foto: true } } },
      });
      if (!anterior) return null;
      if (anterior.llegadaEn || anterior.atendidoEn) return { validationError: 'estado' as const };

      const cambiaHorario =
        (fecha !== undefined && fecha !== anterior.fecha) ||
        (hora !== undefined && hora !== anterior.hora);
      const cambiaDisponibilidad =
        cambiaHorario || (sede !== undefined && sede !== anterior.sede);
      const fechaDestino = fecha ?? anterior.fecha;
      const horaDestino = hora ?? anterior.hora;
      if (cambiaHorario) {
        const configuracion = await transaction.sede.findUnique({ where: { nombre: sede ?? anterior.sede } });
        if (!configuracion || !isValidAppointmentSlot(fechaDestino, horaDestino, configuracion)) {
          return { validationError: 'invalid' as const };
        }
        // Un turno no se mueve hacia atras. Se puede estirar el horario o
        // pizarlo para otro dia, pero devolverlo a una hora anterior deja
        // clientes con avisos del tipo "hora: 19:00 -> 18:00" sobre un turno
        // que ya estaba despues, que no se puede atender. El aviso va al dueño
        // y no hay forma de explicar eso.
        // La comparacion es de texto: "AAAA-MM-DDTHH:mm" ordena igual que el
        // reloj porque los numeros van con dos digitos y en orden fijo.
        if (`${fechaDestino}T${horaDestino}` < `${anterior.fecha}T${anterior.hora}`) {
          return { validationError: 'atras' as const };
        }
      }
      if (cambiaDisponibilidad) {
        const sedeDestino = sede ?? anterior.sede;
        const configuracion = await transaction.sede.findUnique({ where: { nombre: sedeDestino } });
        if (!configuracion || !isValidAppointmentSlot(fechaDestino, horaDestino, configuracion)) return { validationError: 'invalid' as const };
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
              mascotaNombre: anterior.mascota.nombre,
              mascotaFoto: anterior.mascota.foto,
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
      if (resultado.validationError === 'estado') return response.status(409).json({ message: 'El turno ya registró su llegada o fue atendido.' });
      if (resultado.validationError === 'occupied') {
        return response.status(409).json({ message: 'Ese horario ya está ocupado. Elige otro.' });
      }
      if (resultado.validationError === 'atras') {
        return response.status(400).json({
          message: 'No se puede mover un turno a un horario anterior. Solo se puede estirar o pizarlo para otro día.',
        });
      }
      return response.status(400).json({
        message: 'El turno debe ser de lunes a sábado, entre las 10:00 y las 18:30, cada media hora y en el futuro.',
      });
    }

    return response.json({
      ...resultado.turno,
      notificationCreated: resultado.notification !== null,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return response.status(409).json({ message: 'Ese horario ya está ocupado.' });
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    console.error('No se pudo modificar el turno:', error);
    return response.status(500).json({ message: 'No se pudo modificar el turno.' });
  }
});


// Cancela un turno. No se permite si el paciente ya fue atendido
app.delete('/api/admin/turnos/:id', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id del turno no es válido.' });
  }

  // El motivo es opcional: si la veterinaria no escribe nada, el aviso igual
  // dice por que se cancelo, pero en una linea generica.
  const motivoPedido =
    typeof request.body?.motivo === 'string' ? request.body.motivo.trim() : '';
  const motivo =
    motivoPedido !== ''
      ? motivoPedido
      : 'La veterinaria no pudo sostener la atención en ese horario.';

  try {
    const resultado = await prisma.$transaction(async (transaction) => {
      const turno = await transaction.turno.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, nombre: true } },
          mascota: { select: { nombre: true, foto: true } },
        },
      });
      if (!turno) return null;
      if (turno.atendidoEn) {
        return { blocked: 'atendido' as const };
      }
      if (turno.llegadaEn) {
        return { blocked: 'llegada' as const };
      }

      // La notificación se crea antes del borrado y sin turnoId: al eliminar el
      // turno la relación queda en null (onDelete: SetNull) y el aviso sobrevive.
      // La foto va copiada porque, sin el turno, no habria de donde sacarla y
      // el aviso salia sin imagen mientras todos los demas la traen. La sede y
      // la hora tambien: sin ellas la ventana del aviso no puede decir de que
      // sede era el turno que se cayo.
      const notification = await transaction.notification.create({
        data: {
          userId: turno.userId,
          mascotaNombre: turno.mascota.nombre,
          mascotaFoto: turno.mascota.foto,
          sede: turno.sede,
          hora: turno.hora,
          motivo,
          title: 'Tu turno fue cancelado',
          message: `El turno de ${turno.mascota.nombre} del ${formatearFechaLarga(turno.fecha)} a las ${turno.hora} fue cancelado.`,
        },
      });

      await transaction.turno.delete({ where: { id } });

      return { turno, notification };
    });

    if (!resultado) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    if ('blocked' in resultado) {
      return response.status(409).json({
        message:
          resultado.blocked === 'atendido'
            ? 'Ese turno ya fue atendido, no se puede cancelar.'
            : 'Ese paciente ya se presentó, no se puede cancelar.',
      });
    }

    return response.json({
      id: resultado.turno.id,
      cancelado: true,
      notificationCreated: true,
    });
  } catch (error) {
    if (isMissingRecord(error)) {
      return response.status(404).json({ message: 'No se encontró el turno.' });
    }
    console.error('No se pudo cancelar el turno:', error);
    return response.status(500).json({ message: 'No se pudo cancelar el turno.' });
  }
});

// GET /api/notifications
// Devuelve los avisos del usuario autenticado, con el total de avisos sin leer.
app.get('/api/notifications', async (request, response) => {
  const user = await requireAuthenticatedUser(request, response);
  if (!user) return;

  // El recordatorio de "¿tu turno se acerca?" es para el dueno del turno, que
  // es el que tiene que presentarse. Un admin atiende, no espera, asi que no
  // le sirve de nada. Se filtran los que ya quedaron guardados antes de que
  // existiera el filtro al crear el recordatorio.
  const where = {
    userId: user.id,
    ...(user.role === 'ADMIN' ? { title: { not: TITULO_RECORDATORIO_TURNO } } : {}),
  };

  try {
    if (user.role !== 'ADMIN') await createUpcomingAppointmentReminders(user.id);
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        // El turno viene adentro para que la app no tenga que adivinar de que
        // sede hablaba el mensaje: el aviso de "Tu turno se acerca" tiene que
        // mostrar la direccion de ESE turno, no la del proximo turno pendiente.
        include: {
          turno: {
            select: {
              sede: true,
              tipo: true,
              fecha: true,
              hora: true,
              mascota: { select: { nombre: true, foto: true } },
            },
          },
        },
      }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    // La mascota va arriba del aviso y no adentro del turno: cuando el turno
    // se borra al cancelar, los campos copiados en el aviso siguen siendo la
    // unica fuente, y asi todas las tarjetas se ven igual.
    const conMascota = items.map((item) => ({
      ...item,
      mascota:
        item.turno?.mascota ??
        (item.mascotaNombre
          ? { nombre: item.mascotaNombre, foto: item.mascotaFoto ?? null }
          : null),
    }));

    return response.json({ items: conMascota, unreadCount });
  } catch (error) {
    console.error('No se pudieron consultar las notificaciones:', error);
    return response.status(500).json({ message: 'No se pudieron consultar las notificaciones.' });
  }
});

// POST /api/notifications/global
// Aviso general de la veterinaria para todos los usuarios.
app.post('/api/notifications/global', async (request, response) => {
  const adminId = await requireAdmin(request, response);
  if (adminId === null) return;

  const { title, message } = request.body ?? {};
  if (typeof title !== 'string' || title.trim().length < 4 || title.trim().length > 60) {
    return response
      .status(400)
      .json({ message: 'El título tiene que tener entre 4 y 60 caracteres.' });
  }
  if (typeof message !== 'string' || message.trim().length < 4 || message.trim().length > 240) {
    return response
      .status(400)
      .json({ message: 'La descripción tiene que tener entre 4 y 240 caracteres.' });
  }

  try {
    // Se crea una fila por usuario y no una sola compartida: la tabla obliga a
    // que cada aviso pertenezca a alguien (asi el "marcar como leido" no le
    // muestra a uno lo que otro ya leyo) y es la unica forma de que cada
    // cliente vea el suyo en su propia lista.
    const usuarios = await prisma.usuario.findMany({ select: { id: true } });
    const creados = await prisma.notification.createMany({
      data: usuarios.map((usuario) => ({
        userId: usuario.id,
        title: title.trim(),
        message: message.trim(),
        esGlobal: true,
      })),
    });

    return response.status(201).json({ creadas: creados.count });
  } catch (error) {
    console.error('No se pudo enviar la notificación global:', error);
    return response
      .status(500)
      .json({ message: 'No se pudo enviar la notificación a todos los clientes.' });
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
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es valido.' });
  }
  if (id !== autenticado.id) return response.status(403).json({ message: 'Solo puedes acceder a tu propio perfil.' });


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
  const autenticado = await requireAuthenticatedUser(request, response);
  if (!autenticado) return;
  const id = parseId(request.params.id);
  if (id === null) {
    return response.status(400).json({ message: 'El id de usuario no es valido.' });
  }
  if (id !== autenticado.id) return response.status(403).json({ message: 'Solo puedes acceder a tu propio perfil.' });

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

    if (!user) {
      // El correo no existe. Se le dice explícitamente porque el dueño que se
      // equivoca al tipear el correo necesita saber si se equivocó al escribir
      // o al escribir la clave, si no vuelve a intentar lo mismo tres veces.
      return response.status(401).json({ message: 'Correo no registrado.' });
    }

    if (user.password !== password) {
      // Acá sí sabemos que la cuenta existe, asi que se le puede decir al dueño
      // que fue la contraseña. Es la falta de información más comun y la que
      // mas confunde cuando el mensaje es "correo o contraseña".
      return response.status(401).json({ message: 'Contraseña incorrecta.' });
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
