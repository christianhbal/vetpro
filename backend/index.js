const crypto = require('node:crypto');
const path = require('node:path');
const { promisify } = require('node:util');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const cors = require('cors');
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const scrypt = promisify(crypto.scrypt);

app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.post('/api/users', async (request, response) => {
  const { nombre, email, password } = request.body ?? {};

  if (
    typeof nombre !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !nombre.trim() ||
    !/^\S+@\S+\.\S+$/.test(email.trim()) ||
    password.length < 8
  ) {
    return response.status(400).json({ message: 'Revisa el nombre, el correo y la contraseña.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = await scrypt(password, salt, 64);

  try {
    const user = await prisma.user.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: `${salt}:${passwordHash.toString('hex')}`,
      },
      select: { id: true, nombre: true, email: true, createdAt: true },
    });

    return response.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002') {
      return response.status(409).json({ message: 'Ese correo ya está registrado.' });
    }

    console.error('No se pudo registrar el usuario:', error);
    return response.status(500).json({ message: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/sessions', async (request, response) => {
  const { email, password } = request.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return response.status(400).json({ message: 'Ingresa tu correo y contraseña.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const [salt, storedHash] = user?.passwordHash.split(':') ?? ['', ''];
    const candidateHash = await scrypt(password, salt || 'vetpro-invalid-user', 64);
    const expectedHash = Buffer.from(storedHash, 'hex');
    const passwordMatches =
      expectedHash.length === candidateHash.length &&
      crypto.timingSafeEqual(candidateHash, expectedHash);

    if (!user || !passwordMatches) {
      return response.status(401).json({ message: 'El correo o la contraseña no son correctos.' });
    }

    return response.status(200).json({
      id: user.id,
      nombre: user.nombre,
      email: user.email,
    });
  } catch (error) {
    console.error('No se pudo iniciar sesión:', error);
    return response.status(500).json({ message: 'No se pudo iniciar sesión.' });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`API lista en el puerto ${port}`);
  });
}

module.exports = app;