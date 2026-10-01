const crypto = require('node:crypto');
const { promisify } = require('node:util');
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

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`API lista en el puerto ${port}`);
  });
}

module.exports = app;