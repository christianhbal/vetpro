const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const antes = {
    mascotas: await p.mascota.count(),
    turnos: await p.turno.count(),
  };

  const borradosTurnos = await p.turno.deleteMany({});
  const borradosMascotas = await p.mascota.deleteMany({});

  const despues = {
    mascotas: await p.mascota.count(),
    turnos: await p.turno.count(),
    usuarios: await p.user.count(),
  };

  console.log(`mascotas borradas: ${borradosMascotas.count} (de ${antes.mascotas})`);
  console.log(`turnos borrados:   ${borradosTurnos.count} (de ${antes.turnos})`);
  console.log(`estado final -> mascotas: ${despues.mascotas}, turnos: ${despues.turnos}, usuarios: ${despues.usuarios}`);

  await p.$disconnect();
})();