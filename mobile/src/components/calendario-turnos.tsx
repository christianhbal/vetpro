import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DIAS_SEMANA } from '@/lib/datos';

type TurnoCalendario = { fecha: string };

function construirDias(mes: Date): (number | null)[] {
  const primerDia = (new Date(mes.getFullYear(), mes.getMonth(), 1).getDay() + 6) % 7;
  const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const espaciosFinales = (7 - ((primerDia + totalDias) % 7)) % 7;
  return [
    ...Array<number | null>(primerDia).fill(null),
    ...Array.from({ length: totalDias }, (_valor, indice) => indice + 1),
    ...Array<number | null>(espaciosFinales).fill(null),
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
  fechaSeleccionada,
  onSelectFecha,
}: {
  turnos: TurnoCalendario[];
  valorHoy: string;
  fechaSeleccionada: string | null;
  onSelectFecha: (valor: string) => void;
}) {
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(
    () => new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  );

  const dias = useMemo(() => construirDias(mesVisible), [mesVisible]);

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
          if (dia === null) return <View key={`vacia-${indice}`} style={styles.dia} />;

          const fecha = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
          const valor = fechaComoValor(fecha);
          const tieneTurno = fechasConTurno.has(valor);
          const esHoy = valor === valorHoy;
          const esPasado = valor < valorHoy;
          const seleccionado = valor === fechaSeleccionada;

          return (
            <Pressable
              key={`dia-${dia}`}
              style={[
                styles.dia,
                esPasado && !seleccionado && styles.diaPasado,
                esHoy && !seleccionado && styles.diaHoy,
                seleccionado && styles.diaSeleccionado,
              ]}
              onPress={() => onSelectFecha(seleccionado ? '' : valor)}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado }}
              accessibilityLabel={`Día ${dia} de ${nombreMes}${tieneTurno ? ', tiene turno' : ', sin turnos'}`}
            >
              <Text
                style={[
                  styles.diaTexto,
                  esHoy && styles.diaTextoHoy,
                  esPasado && !seleccionado && styles.diaTextoPasado,
                  seleccionado && styles.diaTextoSeleccionado,
                ]}
              >
                {dia}
              </Text>
              {tieneTurno ? (
                <View style={[styles.turnoDot, seleccionado && styles.turnoDotSeleccionado]} />
              ) : null}
            </Pressable>
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
    // Antes 4: las celdas quedaban pegadas al borde y entre si, y los numeros
    // se leian amontonados.
    paddingHorizontal: 10,
    paddingBottom: 10,
    marginBottom: 10,
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
  // Las celdas ocupan 13% en vez de 1/7 exacto: con 100/7 quedaban pegadas unas
  // a otras y los dias con fondo formaban una banda corrida. Con space-between
  // la fila reparte el aire sobrante.
  grilla: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  weekday: {
    width: '13%',
    paddingVertical: 5,
    color: '#69746a',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  dia: {
    width: '13%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  diaHoy: {
    borderWidth: 1.5,
    borderColor: '#0f3e17',
  },
  diaPasado: {
    backgroundColor: '#f7fbf6',
  },
  diaSeleccionado: {
    backgroundColor: '#0f3e17',
  },
  diaTexto: { color: '#263b32', fontSize: 13 },
  diaTextoHoy: { fontWeight: 'bold', color: '#0f3e17' },
  diaTextoPasado: { color: '#a9b0a8' },
  diaTextoSeleccionado: { color: '#fffefc', fontWeight: 'bold' },
  turnoDot: {
    position: 'absolute',
    bottom: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2f7a3f',
  },
  // La leyenda va como una pila centrada: antes era un punto suelto pegado al
  // borde y a cinco pixeles del texto, y se leia como un error de maquetado.
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#e4f1e0',
  },
  legendPunto: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2f7a3f',
  },
  legendText: { color: '#3d5546', fontSize: 11, fontWeight: '600' },
  turnoDotSeleccionado: { backgroundColor: '#fffefc' },
});
