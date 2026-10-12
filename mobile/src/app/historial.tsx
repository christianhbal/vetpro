import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DimensionValue } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { DIAS_SEMANA } from '@/components/availability-calendar';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { formatearFechaTurno, sedesVeterinaria, type TurnoGuardado } from '@/lib/datos';
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
      // El admin ve la agenda completa y el usuario solo sus turnos. Con
      // ?userId= el historial salia incompleto: los turnos de otra sede
      // pertenecen a otro dueño y no aparecian nunca.
      const response = await fetch(
        usuario.esAdmin
          ? `${API_BASE_URL}/api/admin/turnos?incluirOcultos=1`
          : `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`,
        { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
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

  // El domingo se puede seleccionar a proposito: muestra el aviso de que no se
  // atiende en vez de quedarse vacio sin explicacion.
  const esDomingoElegido =
    fechaSeleccionada !== null && new Date(`${fechaSeleccionada}T12:00:00`).getDay() === 0;

  const atendidos = useMemo(
    () =>
      turnos
        // Un turno cuenta como atendido cuando tiene descripcion: eso es lo
        // que carga el veterinario al completar la atencion. No se usa
        // atendidoEn porque en la base hay 216 turnos con descripcion y sin
        // ese flag, asi que el flag solo no sirve.
        .filter((turno) => Boolean(turno.descripcion) && turnoYaPaso(turno, ahora))
        .sort((a, b) => `${b.fecha}T${b.hora}`.localeCompare(`${a.fecha}T${a.hora}`)),
    [turnos, ahora]
  );

  // No se muestra nada hasta que se elige un dia. El historial siempre arranca
  // con "Seleccione una fecha": antes salia la lista entera del mes sin haber
  // tocado el calendario.
  const turnosDelDia = useMemo(
    () =>
      esDomingoElegido
        ? []
        : atendidos.filter(
            (turno) => filtroSede === 'Todas' || turno.sede === filtroSede
          ),
    [atendidos, esDomingoElegido, filtroSede]
  );

  const turnosVisibles = turnosDelDia.filter(
    (turno) => turno.fecha === fechaSeleccionada
  );

  // El orden sale de la lista de sedes de la app y no del Set: con el Set las
  // fichas salian en el orden en que aparecian los turnos, distinto al de
  // Turnos.
  const sedesDisponibles = useMemo(() => {
    const conTurnos = new Set(atendidos.map((turno) => turno.sede));
    return ['Todas', ...sedesVeterinaria.filter((sede) => conTurnos.has(sede))];
  }, [atendidos]);

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

  const renderTurno = ({ item }: { item: TurnoPasado }) => {
    const abierto = turnoAbierto === item.id;

    return (
      <Pressable
        style={({ pressed }) => [estilos.cardTurno, pressed && estilos.buttonPressed]}
        onPress={() => setTurnoAbierto(abierto ? null : item.id)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={`${abierto ? 'Ocultar' : 'Ver'} la atención del turno de ${item.mascota.nombre}`}
      >
        <View style={styles.tarjetaEncabezado}>
          {/* La foto de la mascota: con cuatro tarjetas en pantalla el nombre
              sola no alcanza a saber cual es cual. */}
          {item.mascota.foto ? (
            <Image
              source={{ uri: item.mascota.foto }}
              style={styles.tarjetaFoto}
              resizeMode="cover"
              accessibilityLabel={`Foto de ${item.mascota.nombre}`}
            />
          ) : (
            <View style={[styles.tarjetaFoto, styles.tarjetaFotoVacia]}>
              <Ionicons name="paw-outline" size={20} color="#5f7d63" />
            </View>
          )}
          <View style={styles.tarjetaTexto}>
            <Text style={estilos.cardTituloTurno} numberOfLines={1} ellipsizeMode="tail">
              {item.mascota.nombre} - {item.tipo}
            </Text>
            <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
              {formatearFechaTurno(item.fecha, item.hora)} · {item.sede}
            </Text>
          </View>
          <Ionicons
            name={abierto ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#556b58"
          />
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
    // AppDrawer va sin onVolver a proposito: asi el rincon de la izquierda
    // queda con el menu, igual que en Turnos. Con onVolver aparecia una flecha
    // de "volver" que ninguna otra pantalla tiene.
    <AppDrawer title="Historial">
      {/* El calendario queda fijo arriba y los turnos de abajo se desplazan
          solos, como "Turnos siguientes" en la portada. Asi el dia elegido se
          ve siempre, por mas turnos que haya. */}
      <View style={styles.pantalla}>
        <View style={styles.cabecera}>
          {/* Sin titulo grande: la barra de arriba ya dice "Historial" y ese
              bloque robaba alto a la lista de turnos. */}
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
              {DIAS_SEMANA.map((dia, index) => (
                <Text key={`weekday-${index}`} style={styles.weekday}>
                  {dia}
                </Text>
              ))}
              {dias.map((dia, index) => {
                if (dia === null) return <View key={`empty-${index}`} style={styles.dia} />;
                const fecha = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
                const valor = fechaComoValor(fecha);
                const esFuturo = valor > hoyValor;
                // El domingo se puede tocar: no se atiende, asi que en vez de
                // dejarlo muerto muestra abajo que ese dia no hubo nada.
                const esDomingo = fecha.getDay() === 0;
                const deshabilitado = esFuturo;
                const seleccionado = fechaSeleccionada === valor;
                const nombreMes = mesVisible.toLocaleDateString('es-AR', { month: 'long' });
                return (
                  <Pressable
                    key={`day-${dia}`}
                    style={[
                      styles.dia,
                      esDomingo && !seleccionado && styles.diaDomingo,
                      seleccionado && styles.diaSeleccionado,
                    ]}
                    onPress={() => elegirFecha(valor)}
                    disabled={deshabilitado}
                    accessibilityRole="button"
                    accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                    accessibilityLabel={`${dia} de ${nombreMes}${esDomingo ? ', domingo sin atención' : esFuturo ? ', no disponible' : ''}`}
                  >
                    <Text
                      style={[
                        styles.diaTexto,
                        seleccionado && styles.diaTextoSeleccionado,
                        deshabilitado && !seleccionado && styles.diaTextoDeshabilitado,
                        esDomingo && !seleccionado && styles.diaTextoDomingo,
                      ]}
                    >
                      {dia}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {cargando ? (
            <ActivityIndicator color="#0f3e17" style={styles.cargando} />
          ) : error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>

        {/* Copia del bloque "Turnos completados" de la pantalla Turnos: una caja
            de alto fijo con su propio desplazamiento, para que la pantalla no
            se mueva y el calendario quede siempre a la vista. */}
        <View style={styles.lista}>
          <View style={styles.listaEncabezado}>
            <Text style={styles.listaTitulo}>
              {fechaSeleccionada
                ? `Turnos del ${new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR')}`
                : 'Turnos atendidos'}
            </Text>
            <View style={styles.listaFila}>
              <Text style={styles.listaSubtitulo}>
                {turnosVisibles.length === 1 ? '1 turno' : `${turnosVisibles.length} turnos`}
              </Text>
              {fechaSeleccionada ? (
                <Pressable
                  onPress={() => setFechaSeleccionada(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar el filtro de fecha"
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color="#556b58" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator
            contentContainerStyle={styles.listaContenido}
          >
            {turnosVisibles.length > 0 ? (
              turnosVisibles.map((turno) => (
                <React.Fragment key={turno.id}>{renderTurno({ item: turno })}</React.Fragment>
              ))
            ) : !cargando && !error ? (
              <View style={styles.sinTurnos}>
                <View style={styles.sinTurnosIcono}>
                  <Ionicons name="calendar-outline" size={24} color="#5f7d63" />
                </View>
                <Text style={styles.sinTurnosTitulo}>
                  {fechaSeleccionada
                    ? 'Ese día no hubo turnos atendidos'
                    : 'Seleccione una fecha'}
                </Text>
                <Text style={styles.sinTurnosTexto}>
                  {fechaSeleccionada
                    ? 'Probá con otro día del calendario.'
                    : 'Elegí un día del calendario para ver los turnos que se atenderon.'}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </AppDrawer>
  );
}

const styles = {
  pantalla: { flex: 1, backgroundColor: '#fffefc' },
  // La cabecera no se desplaza: el calendario tiene que quedar siempre a la vista
  // mientras se recorre la lista de turnos.
  cabecera: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4 },
  lista: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 16,
    backgroundColor: '#f2f9f1',
    overflow: 'hidden' as const,
  },
  listaEncabezado: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  listaFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    marginTop: 2,
  },
  listaTitulo: { color: '#0f3e17', fontSize: 16, fontWeight: 'bold' as const },
  listaSubtitulo: { color: '#556b58', fontSize: 13 },
  listaContenido: { paddingHorizontal: 12, paddingBottom: 12 },
  bloque: { marginBottom: 16 },
  label: { marginBottom: 8, color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
  filaSedes: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  sedeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 16,
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
  monthButton: { width: 34, height: 30, alignItems: 'center' as const, justifyContent: 'center' as const },
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
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 20,
  },
  diaSeleccionado: { backgroundColor: '#0f3e17' },
  diaDomingo: { backgroundColor: '#f2f9f1' },
  diaTexto: { color: '#263b32', fontSize: 14 },
  diaTextoSeleccionado: { color: '#fffefc', fontWeight: 'bold' as const },
  diaTextoDeshabilitado: { color: '#a9b0a8' },
  diaTextoDomingo: { color: '#8b978c' },
  cargando: { paddingVertical: 16 },
  error: { marginTop: 10, color: '#a32828', fontSize: 13, lineHeight: 19 },
  sinTurnos: {
    alignItems: 'center' as const,
    marginTop: 12,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dcecdc',
    backgroundColor: '#f2f9f1',
  },
  sinTurnosIcono: {
    width: 52,
    height: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 10,
    borderRadius: 26,
    backgroundColor: '#e4f1e0',
  },
  sinTurnosTitulo: {
    color: '#0f3e17',
    fontSize: 15,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  sinTurnosTexto: {
    marginTop: 4,
    color: '#556b58',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center' as const,
  },
  tarjetaEncabezado: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  tarjetaFoto: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#cfe7d3',
  },
  tarjetaFotoVacia: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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