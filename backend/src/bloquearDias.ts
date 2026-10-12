import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { HORARIOS, MARCA_DIA_COMPLETO } from './horarios';

config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const sedesVeterinaria = ['Recoleta', 'San Isidro', 'Vicente López'] as const;

// Dias de la semana que se dejan completos. getDay(): 0 domingo, 3 miercoles,
// 4 jueves, 6 sabado. El domingo no va porque la veterinaria no atiende.
const DIAS_BLOQUEADOS: { dia: number; nombre: string; cantidad: number }[] = [
  { dia: 3, nombre: 'miercoles', cantidad: 4 },
  { dia: 4, nombre: 'jueves', cantidad: 4 },
  { dia: 6, nombre: 'sabado', cantidad: 4 },
];

// Estos turnos son reales a proposito: la agenda los tiene que mostrar como
// ocupados. Para poder distinguirlos de los turnos de verdad y liberarlos sin
// tocar nada importante, todos llevan esta marca en la descripcion.
const MARCA = MARCA_DIA_COMPLETO;

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Los proximos N dias de la semana a partir de hoy. Si hoy cae en ese dia,
 * arranca en 7 dias: el dia de hoy ya tiene sus propios turnos de ejemplo.
 */
function proximosDias(diaSemana: number, cantidad: number): Date[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const encontrados: Date[] = [];
  let cursor = new Date(hoy);
  while (encontrados.length < cantidad) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    if (cursor.getDay() === diaSemana) encontrados.push(new Date(cursor));
  }
  return encontrados;
}

async function main(): Promise<void> {
  const fechasPorDia = DIAS_BLOQUEADOS.map((configuracion) => ({
    nombre: configuracion.nombre,
    fechas: proximosDias(configuracion.dia, configuracion.cantidad).map(fechaComoValor),
  }));

  const liberados = await prisma.turno.deleteMany({ where: { descripcion: MARCA } });
  if (liberados.count > 0) {
    console.log(`Se liberaron ${liberados.count} horarios de la ronda anterior.`);
  }

  const duenos = await prisma.mascota.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true },
    orderBy: { id: 'asc' },
  });
  const conDueno = duenos.flatMap((mascota) =>
    mascota.userId === null ? [] : [{ id: mascota.id, userId: mascota.userId }]
  );
  if (conDueno.length === 0) {
    throw new Error('No hay mascotas con dueño. Registra al menos una primero.');
  }

  for (const { nombre, fechas } of fechasPorDia) {
    console.log(`\nOcupando ${fechas.length} ${nombre} completos en las tres sedes:\n`);
  }

  let creados = 0;
  for (const { fechas } of fechasPorDia) {
    for (const fecha of fechas) {
      for (const sede of sedesVeterinaria) {
        let i = 0;
        for (const hora of HORARIOS) {
          const mascota = conDueno[i % conDueno.length];
          const tipo = i % 3 === 0 ? 'Vacunas' : i % 3 === 1 ? 'Control' : 'Estética';
          await prisma.turno.create({
            data: {
              tipo,
              sede,
              fecha,
              hora,
              // Sin llegada ni atencion: no aparecen en ninguna lista, solo
              // ocupan la agenda.
              llegadaEn: null,
              atendidoEn: null,
              descripcion: MARCA,
              esDemo: false,
              // Ocupan la agenda para que el calendario muestre el dia
              // completo, pero no salen en "Turnos siguientes": si salieran,
              // la pantalla mostraria 18 turnos por sede.
              ocultoEnAgenda: true,
              user: { connect: { id: mascota.userId } },
              mascota: { connect: { id: mascota.id } },
            },
          });
          i += 1;
          creados += 1;
        }
        console.log(`  ${fecha}  ${sede.padEnd(13)} ${HORARIOS.length} horarios ocupados`);
      }
    }
  }

  const totalDias = fechasPorDia.reduce((suma, item) => suma + item.fechas.length, 0);
  console.log(`\nListo: ${creados} horarios bloqueados en ${totalDias} dias completos.`);
  console.log('Para liberarlos: npm run db:dias:liberar');
}

main()
  .catch((error: unknown) => {
    console.error('No se pudieron bloquear los dias completos:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());