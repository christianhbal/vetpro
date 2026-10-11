import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DimensionValue } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { formatearFechaTurno, type TurnoGuardado } from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

type TurnoPasado = TurnoGuardado & {
  atendidoEn?: string | null;
  descripcion?: string | null;
};

function esTurnoGuardado(value: unknown): value is TurnoPasado {
  if (typeof value !== 'object' || value === null || !('mascota' in value)) return false;
  const turno = value as Record<string, unknown>;
  const mascota = turno.mascota;
  if (typeof mascota !== 'object' || mascota === null) return false;
  const datosMascota = mascota as Record<string, unknown>;

  return (
    typeof turno.id === 'number' &&
    typeof turno.tipo === 'string' &&
    typeof turno.sede === 'string' &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    typeof turno.mascotaId === 'number' &&
    typeof datosMascota.id === 'number' &&
    typeof datosMascota.nombre === 'string' &&
    typeof datosMascota.especie === 'string' &&
    (typeof datosMascota.raza === 'string' || datosMascota.raza === null)
  );
}

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

// Un turno cuenta como pasado cuando su fecha+hora ya quedo atras.
function turnoYaPaso(turno: TurnoPasado, ahora: Date): boolean {
  const [year, month, day] = turno.fecha.split('-').map(Number);
  const [hour, minute] = turno.hora.split(':').map(Number);
  const fechaHora = new Date(year, month - 1, day, hour, minute);
  return (
    Number.isFinite(fechaHora.getTime()) &&
    fechaHora.getFullYear() === year &&
    fechaHora.getMonth() === month - 1 &&
    fechaHora.getDate() === day &&
    fechaHora.getTime() < ahora.getTime()
  );
}

export default function Historial() {
  const [turnos, setTurnos] = useState<TurnoPasado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mesVisible, setMesVisible] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null);
  const [filtroSede, setFiltroSede] = useState<'Todas' | string>('Todas');
  const [turnoAbierto, setTurnoAbierto] = useState<number | null>(null);

  const cargarHistorial = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado: unknown = await response.json();
      if (!response.ok) {
        const mensaje =
          typeof resultado === 'object' &&
          resultado !== null &&
          'message' in resultado &&
          typeof resultado.message === 'string'
            ? resultado.message
            : 'No se pudo cargar tu historial.';
        setError(mensaje);
        setTurnos([]);
        return;
      }
      if (!Array.isArray(resultado) || !resultado.every(esTurnoGuardado)) {
        setError('La respuesta del servidor no tiene el formato esperado.');
        setTurnos([]);
        return;
      }
      setTurnos(resultado);
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setTurnos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarHistorial();
    }, [cargarHistorial])
  );

  // Fijo por render de la lista: si se recrea en cada render, el useMemo de
  // "pasados" se recalcula siempre y pierde sentido.
  const ahora = useMemo(() => new Date(), []);
  const hoyValor = fechaComoValor(ahora);
  const dias = useMemo(() => construirDias(mesVisible), [mesVisible]);

  const pasados = useMemo(
    () =>
      turnos
        .filter((turno) => turnoYaPaso(turno, ahora))
        .sort((a, b) => `${b.fecha}T${b.hora}`.localeCompare(`${a.fecha}T${a.hora}`)),
    [turnos, ahora]
  );

  // Filtro por sede y por dia, en ese orden.
  const turnosVisibles = pasados.filter((turno) => {
    const coincideSede = filtroSede === 'Todas' || turno.sede === filtroSede;
    const coincideFecha = fechaSeleccionada === null || turno.fecha === fechaSeleccionada;
    return coincideSede && coincideFecha;
  });

  const sedesDisponibles = useMemo(() => {
    const sedes = new Set(pasados.map((turno) => turno.sede));
    return ['Todas', ...Array.from(sedes)];
  }, [pasados]);

  const moverMes = (cantidad: number) => {
    setFechaSeleccionada(null);
    setTurnoAbierto(null);
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1));
  };

  const elegirSede = (sede: string) => {
    setFiltroSede(sede);
    setTurnoAbierto(null);
  };

  const elegirFecha = (valor: string) => {
    setFechaSeleccionada(fechaSeleccionada === valor ? null : valor);
    setTurnoAbierto(null);
  };

  const salir = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/app');
  };

  const renderTurno = ({ item }: { item: TurnoPasado }) => {
    const atendido = item.atendidoEn !== null && item.atendidoEn !== undefined;
    const abierto = turnoAbierto === item.id;
    const tieneDescripcion = Boolean(item.descripcion);

    return (
      <Pressable
        style={({ pressed }) => [
          estilos.cardTurno,
          atendido && styles.tarjetaAtendida,
          pressed && tieneDescripcion && estilos.buttonPressed,
        ]}
        onPress={() => (tieneDescripcion ? setTurnoAbierto(abierto ? null : item.id) : undefined)}
        disabled={!tieneDescripcion}
        accessibilityRole={tieneDescripcion ? 'button' : 'text'}
        accessibilityState={{ expanded: tieneDescripcion ? abierto : undefined }}
        accessibilityLabel={
          tieneDescripcion
            ? `${abierto ? 'Ocultar' : 'Ver'} la atención del turno de ${item.mascota.nombre}`
            : `Turno de ${item.mascota.nombre}, ${item.tipo}`
        }
      >
        <View style={styles.tarjetaEncabezado}>
          <View style={styles.tarjetaTexto}>
            <Text style={estilos.cardTituloTurno} numberOfLines={1} ellipsizeMode="tail">
              {item.mascota.nombre} - {item.tipo}
            </Text>
            <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
              {formatearFechaTurno(item.fecha, item.hora)} · {item.sede}
            </Text>
          </View>
          {tieneDescripcion ? (
            <Ionicons
              name={abierto ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#556b58"
            />
          ) : null}
        </View>

        {abierto && item.descripcion ? (
          <View style={styles.descripcionCaja}>
            <Text style={styles.descripcionLabel}>Descripción</Text>
            <Text style={styles.descripcion}>{item.descripcion}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <AppDrawer title="Historial" onVolver={salir} etiquetaVolver="Volver">
      <FlatList
        style={estilos.container}
        data={turnosVisibles}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.contenido}
        renderItem={renderTurno}
        ListHeaderComponent={
          <View>
            <View style={styles.encabezado}>
              <Text style={styles.titulo}>Historial</Text>
              <Text style={styles.subtitulo}>Elegí un día para ver los turnos que ya pasaron.</Text>
            </View>

            <View style={styles.bloque}>
              <Text style={styles.label}>Sede</Text>
              <View style={styles.filaSedes}>
                {sedesDisponibles.map((opcion) => {
                  const seleccionada = filtroSede === opcion;
                  return (
                    <Pressable
                      key={opcion}
                      onPress={() => elegirSede(opcion)}
                      accessibilityRole="radio"
                      accessibilityLabel={opcion}
                      accessibilityState={{ selected: seleccionada }}
                      style={({ pressed }) => [
                        styles.sedeChip,
                        seleccionada && styles.sedeChipActivo,
                        pressed && estilos.buttonPressed,
                      ]}
                    >
                      <Text style={[styles.sedeTexto, seleccionada && styles.sedeTextoActivo]}>
                        {opcion}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.bloque}>
              <View style={styles.monthRow}>
                <Pressable
                  style={styles.monthButton}
                  onPress={() => moverMes(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Mes anterior"
                >
                  <Ionicons name="chevron-back" size={22} color="#0f3e17" />
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
                  <Ionicons name="chevron-forward" size={22} color="#0f3e17" />
                </Pressable>
              </View>

              <View style={styles.calendar}>
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, index) => (
                  <Text key={`weekday-${index}`} style={styles.weekday}>
                    {dia}
                  </Text>
                ))}
                {dias.map((dia, index) => {
                  if (dia === null) return <View key={`empty-${index}`} style={styles.dia} />;
                  const fecha = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
                  const valor = fechaComoValor(fecha);
                  const esFuturo = valor > hoyValor;
                  const deshabilitado = esFuturo;
                  const seleccionado = fechaSeleccionada === valor;
                  const nombreMes = mesVisible.toLocaleDateString('es-AR', { month: 'long' });
                  return (
                    <Pressable
                      key={`day-${dia}`}
                      style={[styles.dia, seleccionado && styles.diaSeleccionado]}
                      onPress={() => elegirFecha(valor)}
                      disabled={deshabilitado}
                      accessibilityRole="button"
                      accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                      accessibilityLabel={`${dia} de ${nombreMes}${esFuturo ? ', no disponible' : ''}`}
                    >
                      <Text
                        style={[
                          styles.diaTexto,
                          seleccionado && styles.diaTextoSeleccionado,
                          deshabilitado && !seleccionado && styles.diaTextoDeshabilitado,
                        ]}
                      >
                        {dia}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.filtroActivo}>
              <Text style={styles.filtroTexto}>
                {fechaSeleccionada
                  ? `Turnos del ${new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR')}`
                  : 'Todos los días del mes'}
              </Text>
              {fechaSeleccionada ? (
                <Pressable
                  onPress={() => setFechaSeleccionada(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar el filtro de fecha"
                  style={({ pressed }) => [styles.quitarFiltro, pressed && estilos.buttonPressed]}
                >
                  <Ionicons name="close-circle" size={18} color="#556b58" />
                </Pressable>
              ) : null}
            </View>

            {cargando ? (
              <ActivityIndicator color="#0f3e17" style={styles.cargando} />
            ) : error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !cargando && !error ? (
            <Text style={[estilos.cardSubtituloTurno, styles.vacio]}>
              {fechaSeleccionada
                ? 'No hubo turnos ese día.'
                : 'Todavía no tenés turnos anteriores en este mes.'}
            </Text>
          ) : null
        }
      />
    </AppDrawer>
  );
}

const styles = {
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 26,
  },
  encabezado: { alignItems: 'center' as const, marginBottom: 20 },
  titulo: { color: '#0f3e17', fontSize: 30, fontWeight: 'bold' as const, marginBottom: 6 },
  subtitulo: { color: '#556b58', fontSize: 15, textAlign: 'center' as const },
  bloque: { marginBottom: 12 },
  label: { marginBottom: 6, color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
  filaSedes: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  sedeChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  sedeChipActivo: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  sedeTexto: { color: '#1e3326', fontSize: 13, fontWeight: '500' as const },
  sedeTextoActivo: { color: '#0f3e17', fontWeight: 'bold' as const },
  monthRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  monthButton: { width: 38, height: 34, alignItems: 'center' as const, justifyContent: 'center' as const },
  month: {
    color: '#263b32',
    fontSize: 16,
    fontWeight: 'bold' as const,
    textTransform: 'capitalize' as const,
  },
  calendar: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  weekday: {
    width: `${100 / 7}%` as DimensionValue,
    paddingVertical: 5,
    color: '#69746a',
    fontSize: 12,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  dia: {
    width: `${100 / 7}%` as DimensionValue,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 20,
  },
  diaSeleccionado: { backgroundColor: '#0f3e17' },
  diaTexto: { color: '#263b32', fontSize: 14 },
  diaTextoSeleccionado: { color: '#fffefc', fontWeight: 'bold' as const },
  diaTextoDeshabilitado: { color: '#a9b0a8' },
  filtroActivo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    padding: 11,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#eef4ea',
  },
  filtroTexto: { flex: 1, color: '#263b32', fontSize: 13, fontWeight: '600' as const },
  quitarFiltro: { padding: 2 },
  cargando: { paddingVertical: 16 },
  error: { marginTop: 10, color: '#a32828', fontSize: 13, lineHeight: 19 },
  vacio: { paddingBottom: 16 },
  tarjetaAtendida: { borderColor: '#0f3e17', borderWidth: 2 },
  tarjetaEncabezado: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  tarjetaTexto: { flex: 1 },
  descripcionCaja: {
    marginTop: 10,
    padding: 11,
    borderRadius: 10,
    backgroundColor: '#f2f9f1',
  },
  descripcionLabel: {
    marginBottom: 4,
    color: '#6b7d6d',
    fontSize: 11,
    fontWeight: '700' as const,
  },
  descripcion: { color: '#263b32', fontSize: 14, lineHeight: 20 },
};