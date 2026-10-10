import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

type TurnoCalendario = { fecha: string };

function construirDias(mes: Date): (number | null)[] {
  const primerDia = (new Date(mes.getFullYear(), mes.getMonth(), 1).getDay() + 6) % 7;
  const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  return [
    ...Array<number | null>(primerDia).fill(null),
    ...Array.from({ length: totalDias }, (_valor, indice) => indice + 1),
  ];
}

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

export function CalendarioTurnos({
  turnos,
  valorHoy,
}: {
  turnos: TurnoCalendario[];
  valorHoy: string;
}) {
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(
    () => new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  );

  const dias = useMemo(() => construirDias(mesVisible), [mesVisible]);

  // Set de fechas con turno: evita un filter por celda en cada render.
  const fechasConTurno = useMemo(
    () => new Set(turnos.map((turno) => turno.fecha)),
    [turnos]
  );

  const moverMes = (cantidad: number) => {
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1));
  };

  const nombreMes = mesVisible.toLocaleDateString('es-AR', { month: 'long' });

  return (
    <View style={styles.contenedor}>
      <View style={styles.monthRow}>
        <Pressable
          style={styles.monthButton}
          onPress={() => moverMes(-1)}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Text style={styles.month}>
          {mesVisible.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          style={styles.monthButton}
          onPress={() => moverMes(1)}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
        >
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.grilla}>
        {DIAS_SEMANA.map((nombre, indice) => (
          <Text key={`semana-${indice}`} style={styles.weekday}>
            {nombre}
          </Text>
        ))}

        {dias.map((dia, indice) => {
          if (dia === null) return <View key={`vacia-${indice}`} style={styles.day} />;

          const fecha = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
          const valor = fechaComoValor(fecha);
          const tieneTurno = fechasConTurno.has(valor);
          const esHoy = valor === valorHoy;

          return (
            <View
              key={`dia-${dia}`}
              style={[styles.day, esHoy && styles.dayHoy]}
              accessibilityLabel={`Día ${dia} de ${nombreMes}${tieneTurno ? ', tiene turno' : ''}`}
            >
              <Text style={[styles.dayText, esHoy && styles.dayTextHoy]}>{dia}</Text>
              {tieneTurno ? <View style={styles.turnoDot} /> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendPunto} />
        <Text style={styles.legendText}>Día con turno</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    marginBottom: 8,
    backgroundColor: '#f2f9f1',
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 16,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  monthButton: {
    width: 38,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { color: '#0f3e17', fontSize: 24, fontWeight: '600' },
  month: {
    color: '#263b32',
    fontSize: 15,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  grilla: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    paddingVertical: 3,
    color: '#69746a',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  day: {
    width: '14.2857%',
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  dayHoy: {
    borderWidth: 1.5,
    borderColor: '#0f3e17',
  },
  dayText: { color: '#263b32', fontSize: 13 },
  dayTextHoy: { fontWeight: 'bold', color: '#0f3e17' },
  turnoDot: {
    position: 'absolute',
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2f7a3f',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 4,
  },
  legendPunto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2f7a3f',
  },
  legendText: { color: '#69746a', fontSize: 11 },
});
