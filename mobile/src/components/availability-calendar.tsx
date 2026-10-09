import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { sedesVeterinaria, type SedeVeterinaria } from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import { estilos } from '@/lib/estilos';

type HorarioOcupado = { fecha: string; hora: string };

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

function construirDias(mes: Date): (number | null)[] {
  const primerDia = (new Date(mes.getFullYear(), mes.getMonth(), 1).getDay() + 6) % 7;
  const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  return [
    ...Array<number | null>(primerDia).fill(null),
    ...Array.from({ length: totalDias }, (_value, index) => index + 1),
  ];
}

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

function esHorarioOcupado(value: unknown): value is HorarioOcupado {
  if (typeof value !== 'object' || value === null) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.fecha === 'string' && typeof slot.hora === 'string';
}

export function AvailabilityCalendar() {
  const [mesVisible, setMesVisible] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => fechaComoValor(new Date()));
  const [sede, setSede] = useState<SedeVeterinaria>('Recoleta');
  const [horariosOcupados, setHorariosOcupados] = useState<HorarioOcupado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const dias = useMemo(() => construirDias(mesVisible), [mesVisible]);
  const horariosDelDia = horariosOcupados
    .filter((slot) => slot.fecha === fechaSeleccionada)
    .map((slot) => slot.hora)
    .sort();

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      setCargando(true);
      setError('');
      setHorariosOcupados([]);
      void (async () => {
        try {
          const usuario = await obtenerUsuarioActual();
          if (!usuario) {
            throw new Error('Inicia sesión para consultar la disponibilidad.');
          }
          const mes = `${mesVisible.getFullYear()}-${String(mesVisible.getMonth() + 1).padStart(2, '0')}`;
          const response = await fetch(
            `${API_BASE_URL}/api/turnos/disponibilidad?mes=${encodeURIComponent(mes)}&sede=${encodeURIComponent(sede)}`,
            { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
          );
          const result: unknown = await response.json();
          if (!response.ok) {
            throw new Error(mensajeApi(result) ?? 'No se pudo cargar la disponibilidad.');
          }
          if (!Array.isArray(result) || !result.every(esHorarioOcupado)) {
            throw new Error('La API devolvió horarios ocupados inválidos.');
          }
          if (activo) setHorariosOcupados(result);
        } catch (requestError) {
          if (activo) {
            setError(
              requestError instanceof TypeError
                ? apiUnreachableMessage(requestError)
                : requestError instanceof Error
                  ? requestError.message
                  : apiUnreachableMessage(requestError)
            );
          }
        } finally {
          if (activo) setCargando(false);
        }
      })();
      return () => {
        activo = false;
      };
    }, [mesVisible, sede])
  );

  const moverMes = (cantidad: number) => {
    setFechaSeleccionada('');
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1));
  };

  return (
    <View style={styles.card}>
      <Text style={estilos.sectionTitle}>Disponibilidad de turnos</Text>
      <Text style={styles.label}>Sede</Text>
      <View style={styles.picker}>
        <Picker
          selectedValue={sede}
          onValueChange={(value) => {
            if (typeof value === 'string' && sedesVeterinaria.some((item) => item === value)) {
              setSede(value as SedeVeterinaria);
              setFechaSeleccionada('');
            }
          }}
          mode="dropdown"
          accessibilityLabel="Sede de disponibilidad"
        >
          {sedesVeterinaria.map((opcion) => (
            <Picker.Item key={opcion} label={opcion} value={opcion} />
          ))}
        </Picker>
      </View>

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

      <View style={styles.calendar}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, index) => (
          <Text key={`weekday-${index}`} style={styles.weekday}>
            {dia}
          </Text>
        ))}
        {dias.map((dia, index) => {
          if (dia === null) return <View key={`empty-${index}`} style={styles.day} />;
          const date = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
          const value = fechaComoValor(date);
          const ocupado = horariosOcupados.some((slot) => slot.fecha === value);
          const seleccionado = fechaSeleccionada === value;
          return (
            <Pressable
              key={`day-${dia}`}
              style={[styles.day, seleccionado && styles.selectedDay]}
              onPress={() => setFechaSeleccionada(value)}
              disabled={cargando || Boolean(error)}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado, disabled: cargando || Boolean(error) }}
              accessibilityLabel={`${dia} de ${mesVisible.toLocaleDateString('es-AR', { month: 'long' })}${ocupado ? ', tiene horarios ocupados' : ''}`}
            >
              <Text style={[styles.dayText, seleccionado && styles.selectedText]}>{dia}</Text>
              {ocupado && !seleccionado ? <View style={styles.busyDot} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.busyDot} />
        <Text style={styles.legendText}>Día con horarios ocupados</Text>
      </View>
      <View style={styles.timesSection}>
        <Text style={styles.timesTitle}>
          Horarios ocupados ·{' '}
          {fechaSeleccionada
            ? new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR')
            : 'selecciona una fecha'}
        </Text>
        {cargando ? (
          <ActivityIndicator color="#0f3e17" style={styles.loading} />
        ) : error ? (
          <Text style={estilos.cardSubtitle}>{error}</Text>
        ) : horariosDelDia.length ? (
          <View style={styles.timesRow}>
            {horariosDelDia.map((hora, index) => (
              <View key={`${hora}-${index}`} style={styles.busyTime}>
                <Text style={styles.busyTimeText}>{hora}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={estilos.cardSubtitle}>No hay horarios ocupados para esta fecha.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    backgroundColor: '#f7fbf6',
  },
  label: { marginBottom: 4, color: '#53665a', fontSize: 13, fontWeight: '600' },
  picker: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    borderRadius: 8,
    backgroundColor: '#fffefc',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthButton: { width: 36, height: 34, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#0f3e17', fontSize: 26, fontWeight: '600' },
  month: { color: '#263b32', fontSize: 15, fontWeight: 'bold', textTransform: 'capitalize' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    paddingVertical: 5,
    color: '#69746a',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  day: {
    width: '14.2857%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  dayText: { color: '#263b32', fontSize: 13 },
  selectedDay: { backgroundColor: '#0f3e17' },
  selectedText: { color: '#fffefc', fontWeight: 'bold' },
  busyDot: {
    position: 'absolute',
    bottom: 2,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#c05a32',
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  legendText: { color: '#69746a', fontSize: 12 },
  timesSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d8e3d5' },
  timesTitle: { marginBottom: 8, color: '#263b32', fontSize: 13, fontWeight: '600' },
  loading: { paddingVertical: 6 },
  timesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  busyTime: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f5e0d8',
  },
  busyTimeText: { color: '#74351f', fontSize: 12, fontWeight: '600' },
});
