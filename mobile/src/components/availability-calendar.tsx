import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import {
  descripcionEspecieMascota,
  sedesVeterinaria,
  type SedeVeterinaria,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import { estilos } from '@/lib/estilos';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';

const tiposTurno = ['Control', 'Vacunas', 'Estética'] as const;

type TipoTurno = (typeof tiposTurno)[number];

// El backend acepta turnos de lunes a sábado, entre las 10:00 y las 18:30,
// cada media hora.
const horariosDisponibles = Array.from({ length: 18 }, (_value, index) => {
  const minutos = 10 * 60 + index * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
});

const colorOcupadoFondo = '#f2ddcd';
const colorOcupadoBorde = '#d3a179';
const colorOcupadoTexto = '#7d4322';

type HorarioOcupado = { fecha: string; hora: string };

type MascotaPropia = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  foto: string | null;
};

type TurnoCreado = {
  mascota: string;
  especie: string;
  tipo: TipoTurno;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
};

type Props = {
  onTurnoGuardado?: () => void;
  /** Se llama cuando el usuario cierra el aviso de turno creado. */
  onTurnoCerrado?: () => void;
  /**
   * Factor de compresion vertical (0.8 a 1). Lo calcula la pantalla para que
   * el formulario entre entero y la vista no tenga que scrollear.
   */
  escala?: number;
};

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

function horaComoMinutos(hora: string): number {
  const [horas, minutos] = hora.split(':').map(Number);
  return horas * 60 + minutos;
}

function construirDias(mes: Date): (number | null)[] {
  const primerDia = (new Date(mes.getFullYear(), mes.getMonth(), 1).getDay() + 6) % 7;
  const totalDias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  return [
    ...Array<number | null>(primerDia).fill(null),
    ...Array.from({ length: totalDias }, (_value, index) => index + 1),
  ];
}

/**
 * Primer dia con horarios libres a partir de `desde`, salteando domingos.
 * Si hoy ya paso (por ejemplo a la noche) devuelve el proximo dia habil.
 */
function primerDiaAgendable(desde: Date): string {
  const hoy = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  for (let salto = 0; salto < 14; salto += 1) {
    const candidato = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + salto);
    if (candidato.getDay() !== 0) return fechaComoValor(candidato);
  }
  return fechaComoValor(hoy);
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

function esMascotaPropia(value: unknown): value is MascotaPropia {
  if (typeof value !== 'object' || value === null) return false;
  const mascota = value as Record<string, unknown>;
  return (
    typeof mascota.id === 'number' &&
    Number.isInteger(mascota.id) &&
    typeof mascota.nombre === 'string' &&
    typeof mascota.especie === 'string' &&
    (mascota.raza === null || typeof mascota.raza === 'string') &&
    (mascota.foto === null || typeof mascota.foto === 'string')
  );
}

export function AvailabilityCalendar({ onTurnoGuardado, onTurnoCerrado, escala = 1 }: Props) {
  const [mesVisible, setMesVisible] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() =>
    primerDiaAgendable(new Date())
  );
  const [sede, setSede] = useState<SedeVeterinaria>('Recoleta');
  const [horariosOcupados, setHorariosOcupados] = useState<HorarioOcupado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mascotas, setMascotas] = useState<MascotaPropia[]>([]);
  const [cargandoMascotas, setCargandoMascotas] = useState(true);
  const [errorMascotas, setErrorMascotas] = useState('');
  const [mascotaId, setMascotaId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoTurno | ''>('');
  const [horaSeleccionada, setHoraSeleccionada] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');
  const [turnoCreado, setTurnoCreado] = useState<TurnoCreado | null>(null);
  const solicitud = useRef(0);

  const cargarDisponibilidad = useCallback(async () => {
    const idSolicitud = ++solicitud.current;
    const mes = `${mesVisible.getFullYear()}-${String(mesVisible.getMonth() + 1).padStart(2, '0')}`;
    setCargando(true);
    setError('');
    setHorariosOcupados([]);
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        throw new Error('Inicia sesión para consultar la disponibilidad.');
      }
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
      if (idSolicitud === solicitud.current) {
        setHorariosOcupados(result);
        // El horario elegido pudo ocuparse mientras recargabamos.
        setHoraSeleccionada((actual) =>
          actual !== '' && result.some((slot) => slot.hora === actual && slot.fecha === fechaSeleccionada)
            ? ''
            : actual
        );
      }
    } catch (requestError) {
      if (idSolicitud === solicitud.current) {
        setError(
          requestError instanceof TypeError
            ? apiUnreachableMessage(requestError)
            : requestError instanceof Error
              ? requestError.message
              : apiUnreachableMessage(requestError)
        );
      }
    } finally {
      if (idSolicitud === solicitud.current) setCargando(false);
    }
  }, [fechaSeleccionada, mesVisible, sede]);

  useFocusEffect(
    useCallback(() => {
      void cargarDisponibilidad();
    }, [cargarDisponibilidad])
  );

  const cargarMascotas = useCallback(async () => {
    setCargandoMascotas(true);
    setErrorMascotas('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        throw new Error('Inicia sesión para elegir una mascota.');
      }
      const response = await fetch(
        `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado: unknown = await response.json();
      if (!response.ok) {
        setMascotas([]);
        setErrorMascotas(mensajeApi(resultado) ?? 'No se pudieron cargar tus mascotas.');
        return;
      }
      if (!Array.isArray(resultado) || !resultado.every(esMascotaPropia)) {
        throw new Error('La API devolvió mascotas inválidas.');
      }
      setMascotas(resultado);
      setMascotaId((seleccionActual) =>
        resultado.some((mascota: MascotaPropia) => mascota.id === seleccionActual)
          ? seleccionActual
          : null
      );
    } catch (requestError) {
      setMascotas([]);
      setErrorMascotas(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : requestError instanceof Error
            ? requestError.message
            : apiUnreachableMessage(requestError)
      );
    } finally {
      setCargandoMascotas(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const opcionesSede: OpcionSelector[] = useMemo(
    () =>
      sedesVeterinaria.map((nombre) => ({
        valor: nombre,
        titulo: nombre,
      })),
    []
  );

  const opcionesMascota: OpcionSelector[] = useMemo(
    () =>
      mascotas.map((mascota) => ({
        valor: String(mascota.id),
        titulo: mascota.nombre,
        detalle: descripcionEspecieMascota(mascota.especie, mascota.raza),
        foto: mascota.foto,
      })),
    [mascotas]
  );

  const sedeSeleccionada = useMemo(
    () => opcionesSede.find((opcion) => opcion.valor === sede) ?? null,
    [opcionesSede, sede]
  );

  const mascotaSeleccionada = useMemo(
    () =>
      mascotaId === null
        ? null
        : opcionesMascota.find((opcion) => opcion.valor === String(mascotaId)) ?? null,
    [mascotaId, opcionesMascota]
  );

  const ahora = new Date();
  const hoyValor = fechaComoValor(ahora);
  const ahoraMinutos = ahora.getHours() * 60 + ahora.getMinutes();
  const dias = useMemo(() => construirDias(mesVisible), [mesVisible]);

  const ocupadosPorDia = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const slot of horariosOcupados) {
      if (!horariosDisponibles.includes(slot.hora)) continue;
      conteo.set(slot.fecha, (conteo.get(slot.fecha) ?? 0) + 1);
    }
    return conteo;
  }, [horariosOcupados]);

  const ocupadosDia = useMemo(
    () =>
      new Set(
        horariosOcupados
          .filter(
            (slot) => slot.fecha === fechaSeleccionada && horariosDisponibles.includes(slot.hora)
          )
          .map((slot) => slot.hora)
      ),
    [fechaSeleccionada, horariosOcupados]
  );

  const moverMes = (cantidad: number) => {
    setFechaSeleccionada('');
    setHoraSeleccionada('');
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1));
  };

  const hayHorasLibres = horariosDisponibles.some(
    (hora) =>
      !ocupadosDia.has(hora) &&
      !(fechaSeleccionada === hoyValor && horaComoMinutos(hora) <= ahoraMinutos)
  );

  const confirmar = async () => {
    if (guardando) return;
    setMensajeError('');

    if (mascotaId === null || !mascotaSeleccionada) {
      setMensajeError('Elegí la mascota del turno.');
      return;
    }
    if (!tipo) {
      setMensajeError('Elegí el tipo de turno.');
      return;
    }
    if (!fechaSeleccionada) {
      setMensajeError('Elegí una fecha en el calendario.');
      return;
    }
    if (!horaSeleccionada) {
      setMensajeError('Elegí un horario disponible.');
      return;
    }
    if (ocupadosDia.has(horaSeleccionada)) {
      setMensajeError('Ese horario está ocupado. Elegí otro disponible.');
      return;
    }
    if (fechaSeleccionada === hoyValor && horaComoMinutos(horaSeleccionada) <= ahoraMinutos) {
      setMensajeError('Ese horario ya pasó. Elegí otro disponible.');
      return;
    }

    setGuardando(true);
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        throw new Error('Inicia sesión para guardar el turno.');
      }
      const response = await fetch(`${API_BASE_URL}/api/turnos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${usuario.accessToken}`,
        },
        body: JSON.stringify({
          userId: usuario.id,
          mascotaId,
          tipo,
          sede,
          fecha: fechaSeleccionada,
          hora: horaSeleccionada,
        }),
      });
      const resultado: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMensajeError(
          mensajeApi(resultado) ??
            (response.status === 404
              ? 'La API no reconoce el guardado de turnos. Reinicia el backend desde la carpeta backend.'
              : `No se pudo guardar el turno (error ${response.status}).`)
        );
        if (response.status === 409) {
          setHoraSeleccionada('');
          void cargarDisponibilidad();
        }
        return;
      }

      const mascota = mascotas.find((item) => item.id === mascotaId);
      setTurnoCreado({
        mascota: mascota?.nombre ?? mascotaSeleccionada.titulo,
        especie: mascotaSeleccionada.detalle ?? '',
        tipo,
        sede,
        fecha: fechaSeleccionada,
        hora: horaSeleccionada,
      });
      setHoraSeleccionada('');
      void cargarDisponibilidad();
      onTurnoGuardado?.();
    } catch (requestError) {
      setMensajeError(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : requestError instanceof Error
            ? requestError.message
            : apiUnreachableMessage(requestError)
      );
    } finally {
      setGuardando(false);
    }
  };

  const cerrarAviso = () => {
    setTurnoCreado(null);
    onTurnoCerrado?.();
  };

  const puedeConfirmar =
    !guardando &&
    !cargando &&
    !error &&
    mascotaId !== null &&
    tipo !== '' &&
    fechaSeleccionada !== '' &&
    horaSeleccionada !== '' &&
    !ocupadosDia.has(horaSeleccionada) &&
    !(
      fechaSeleccionada === hoyValor &&
      horaComoMinutos(horaSeleccionada) <= ahoraMinutos
    );

  // Medidas que se comprimen con la escala para que el formulario entre entero.
const altoDia = Math.max(30, Math.round(36 * escala));
const altoSlot = Math.max(31, Math.round(36 * escala));
const diaText = Math.max(11, Math.round(13 * escala));
const slotText = Math.max(10, Math.round(12 * escala));

const cuerpoAgenda: ReactNode = (
    <>
      <View style={styles.filaCampos}>
        <View style={styles.columnaCampo}>
          <SelectorCampo
            label="Sede"
            icono="location-outline"
            placeholder="Elegí una sede"
            opciones={opcionesSede}
            seleccion={sedeSeleccionada}
            onSelect={(opcion) => {
              if (opcion.valor === sede) return;
              setSede(opcion.valor as SedeVeterinaria);
              setFechaSeleccionada('');
              setHoraSeleccionada('');
              setMensajeError('');
            }}
            compacto
            accessibilityLabel="Elegir sede de la veterinaria"
          />
        </View>

        <View style={styles.columnaCampo}>
          <SelectorCampo
            label="Mascota"
            icono="paw-outline"
            placeholder="Elegí una mascota"
            opciones={opcionesMascota}
            seleccion={mascotaSeleccionada}
            onSelect={(opcion) => {
              const elegido = Number(opcion.valor);
              if (elegido === mascotaId) return;
              setMascotaId(elegido);
              setHoraSeleccionada('');
              setMensajeError('');
            }}
            compacto
            cargando={cargandoMascotas}
            vacio={errorMascotas || 'Todavía no tenés mascotas. Registrá una para agendar.'}
            accessibilityLabel="Elegir mascota del turno"
          />
        </View>
      </View>

      <Text style={styles.label}>Tipo de turno</Text>
      <View style={styles.tiposFila}>
        {tiposTurno.map((opcion) => {
          const seleccionado = tipo === opcion;
          return (
            <Pressable
              key={opcion}
              style={({ pressed }) => [
                styles.tipoOpcion,
                seleccionado && styles.tipoOpcionSeleccionada,
                pressed && estilos.buttonPressed,
              ]}
              onPress={() => {
                setTipo(opcion);
                setMensajeError('');
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: seleccionado }}
              accessibilityLabel={opcion}
            >
              <Text style={[styles.tipoTexto, seleccionado && styles.tipoTextoSeleccionado]}>
                {opcion}
              </Text>
            </Pressable>
          );
        })}
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
          const ocupados = ocupadosPorDia.get(value) ?? 0;
          const esPasado = value < hoyValor;
          const esDomingo = date.getDay() === 0;
          const completo = ocupados >= horariosDisponibles.length;
          const deshabilitado = esPasado || esDomingo || completo || cargando || Boolean(error);
          const seleccionado = fechaSeleccionada === value;
          const nombreMes = mesVisible.toLocaleDateString('es-AR', { month: 'long' });
          return (
            <Pressable
              key={`day-${dia}`}
              style={[styles.day, { height: altoDia }, seleccionado && styles.selectedDay]}
              onPress={() => {
                setFechaSeleccionada(value);
                setHoraSeleccionada('');
                setMensajeError('');
              }}
              disabled={deshabilitado}
              accessibilityRole="button"
              accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
              accessibilityLabel={`${dia} de ${nombreMes}${ocupados > 0 ? `, ${ocupados} horarios ocupados` : ', todos los horarios disponibles'}${esDomingo ? ', no se atienden domingos' : ''}${esPasado ? ', fecha pasada' : ''}${completo ? ', sin horarios' : ''}`}
            >
              <Text
                style={[
                  styles.dayText,
                  { fontSize: diaText },
                  seleccionado && styles.selectedText,
                  deshabilitado && !seleccionado && styles.disabledText,
                ]}
              >
                {dia}
              </Text>
              {ocupados > 0 && !seleccionado ? <View style={styles.busyDot} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendLibre} />
        <Text style={styles.legendText}>Libre</Text>
        <View style={styles.legendOcupado} />
        <Text style={styles.legendText}>Ocupado</Text>
        <View style={styles.legendPasado} />
        <Text style={styles.legendText}>Pasado</Text>
      </View>

      <View style={styles.timesSection}>
        <Text style={styles.timesTitle}>
          Horarios del{' '}
          {fechaSeleccionada
            ? new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR')
            : 'día seleccionado'}
        </Text>
        {cargando ? (
          <ActivityIndicator color="#0f3e17" style={styles.cargandoBloque} />
        ) : error ? (
          <Text style={estilos.cardSubtitle}>{error}</Text>
        ) : !fechaSeleccionada ? (
          <Text style={estilos.cardSubtitle}>Elegí una fecha para ver los horarios.</Text>
        ) : (
          <View>
            {!hayHorasLibres ? (
              <Text style={styles.sinHoras}>
                No quedan horarios libres para esta fecha. Probá con otro día.
              </Text>
            ) : null}
            <View style={[styles.slotsGrid, { gap: Math.max(4, Math.round(5 * escala)) }]}>
              {horariosDisponibles.map((hora) => {
                const ocupado = ocupadosDia.has(hora);
                const pasado =
                  fechaSeleccionada === hoyValor && horaComoMinutos(hora) <= ahoraMinutos;
                const deshabilitado = ocupado || pasado || guardando;
                const seleccionado = horaSeleccionada === hora;
                return (
                  <Pressable
                    key={hora}
                    disabled={deshabilitado}
                    onPress={() => {
                      setHoraSeleccionada(hora);
                      setMensajeError('');
                    }}
                    style={({ pressed }) => [
                      styles.slot,
                      { minHeight: altoSlot },
                      seleccionado && styles.slotSeleccionado,
                      ocupado && styles.slotOcupado,
                      pasado && !ocupado && styles.slotPasado,
                      pressed && !deshabilitado && estilos.buttonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                    accessibilityLabel={`${hora}${ocupado ? ', ocupado' : pasado ? ', no disponible' : ', disponible'}`}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        { fontSize: slotText },
                        seleccionado && styles.slotTextSeleccionado,
                        ocupado && styles.slotTextOcupado,
                        pasado && !ocupado && styles.slotTextPasado,
                      ]}
                    >
                      {hora}
                    </Text>
                    {ocupado ? (
                      <View style={styles.slotIcono}>
                        <Ionicons name="lock-closed" size={9} color={colorOcupadoTexto} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {mensajeError ? (
        <Text accessibilityRole="alert" style={styles.mensajeError}>
          {mensajeError}
        </Text>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.confirmar,
          !puedeConfirmar && estilos.buttonPressed,
          pressed && puedeConfirmar && estilos.buttonPressed,
        ]}
        onPress={() => void confirmar()}
        disabled={!puedeConfirmar}
        accessibilityRole="button"
        accessibilityLabel="Guardar turno"
        accessibilityState={{ disabled: !puedeConfirmar, busy: guardando }}
      >
        <Text style={styles.confirmarTexto}>
          {guardando ? 'Guardando...' : 'Guardar turno'}
        </Text>
      </Pressable>
    </>
  );

  return (
    <>
      <View style={styles.card}>{cuerpoAgenda}</View>

      <Modal
        visible={turnoCreado !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={cerrarAviso}
      >
        <View style={styles.avisoRaiz}>
          <Pressable
            style={styles.avisoFondo}
            onPress={cerrarAviso}
            accessibilityRole="button"
            accessibilityLabel="Cerrar aviso"
          />

          {turnoCreado && (
            <View style={styles.aviso}>
              <View style={styles.avisoIcono}>
                <Ionicons name="checkmark" size={38} color="#fffefc" />
              </View>

              <Text style={styles.avisoTitulo}>¡Turno creado con éxito!</Text>
              <Text style={styles.avisoSubtitulo}>
                Guardamos el turno de {turnoCreado.mascota}
                {turnoCreado.especie ? ` · ${turnoCreado.especie}` : ''}.
              </Text>

              <View style={styles.avisoDatos}>
                <View style={styles.avisoDato}>
                  <Ionicons name="medical-outline" size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTexto}>{turnoCreado.tipo}</Text>
                </View>
                <View style={styles.avisoDato}>
                  <Ionicons name="calendar-outline" size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTexto}>
                    {new Date(`${turnoCreado.fecha}T12:00:00`).toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>
                </View>
                <View style={styles.avisoDato}>
                  <Ionicons name="time-outline" size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTexto}>{turnoCreado.hora} hs</Text>
                </View>
                <View style={styles.avisoDato}>
                  <Ionicons name="location-outline" size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTexto}>{turnoCreado.sede}</Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [styles.avisoBoton, pressed && estilos.buttonPressed]}
                onPress={cerrarAviso}
                accessibilityRole="button"
                accessibilityLabel="Cerrar y ver mis turnos"
              >
                <Text style={styles.avisoBotonTexto}>Listo</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 4,
    paddingBottom: 12,
    backgroundColor: '#fffefc',
  },
  campoBloque: { marginBottom: 10 },
  filaCampos: { flexDirection: 'row', gap: 8 },
  columnaCampo: { flex: 1 },
  label: {
    marginBottom: 6,
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600',
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 14,
    backgroundColor: '#fffefc',
  },
  campoCompacto: {
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 12,
  },
  campoConValor: { borderColor: '#a8c3a4', backgroundColor: '#ffffff' },
  campoIcono: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#e4f1e0',
  },
  campoIconoCompacto: { width: 28, height: 28, borderRadius: 9 },
  campoAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e4f1e0' },
  avatarCompacto: { width: 28, height: 28, borderRadius: 14 },
  campoAvatarVacio: { alignItems: 'center', justifyContent: 'center' },
  campoTextoBloque: { flex: 1 },
  campoTexto: { color: '#1e3326', fontSize: 16, fontWeight: '600' },
  campoTextoCompacto: { fontSize: 14 },
  campoTextoVacio: { color: '#8b978c', fontWeight: '500' },
  campoDetalle: { marginTop: 2, color: '#77847a', fontSize: 13 },
  hojaRaiz: { flex: 1, justifyContent: 'flex-end' },
  hojaFondo: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 32, 22, 0.45)' },
  hoja: {
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingBottom: 30,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#fffefc',
  },
  hojaPestana: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    marginTop: 10,
    borderRadius: 3,
    backgroundColor: '#d3ded0',
  },
  hojaEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  hojaTitulo: {
    color: '#0f3e17',
    fontSize: 19,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  hojaCerrar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#eef4ea',
  },
  hojaOpciones: { gap: 8 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    borderWidth: 1.5,
    borderColor: '#e2e9de',
    borderRadius: 14,
    backgroundColor: '#fbfdf9',
  },
  opcionElegida: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  opcionAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e4f1e0' },
  opcionAvatarIcono: { alignItems: 'center', justifyContent: 'center' },
  opcionTextoBloque: { flex: 1 },
  opcionTitulo: { color: '#1e3326', fontSize: 16, fontWeight: '600' },
  opcionTituloElegido: { color: '#0f3e17', fontWeight: 'bold' },
  opcionDetalle: { marginTop: 2, color: '#77847a', fontSize: 13 },
  opcionCheck: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  cargandoBloque: { paddingVertical: 12 },
  mensajeBloque: {
    color: '#6f7d72',
    fontSize: 13,
    lineHeight: 19,
  },
  tiposFila: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tipoOpcion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  tipoOpcionSeleccionada: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  tipoTexto: { color: '#1e3326', fontSize: 13, fontWeight: '500' },
  tipoTextoSeleccionado: { color: '#0f3e17', fontWeight: 'bold' },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
  },
  monthButton: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
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
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  dayText: { color: '#263b32', fontSize: 13 },
  selectedDay: { backgroundColor: '#0f3e17' },
  selectedText: { color: '#fffefc', fontWeight: 'bold' },
  disabledText: { color: '#a0a69f' },
  busyDot: {
    position: 'absolute',
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colorOcupadoBorde,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  legendLibre: {
    width: 15,
    height: 15,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#a8c3a4',
    backgroundColor: '#ffffff',
  },
  legendOcupado: {
    width: 15,
    height: 15,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colorOcupadoBorde,
    backgroundColor: colorOcupadoFondo,
  },
  legendPasado: {
    width: 15,
    height: 15,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#e3e5e1',
    backgroundColor: '#f1f2ef',
  },
  legendText: { color: '#69746a', fontSize: 12, marginRight: 6 },
  timesSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#dfe8db' },
  timesTitle: { marginBottom: 9, color: '#263b32', fontSize: 13, fontWeight: '600' },
  sinHoras: {
    marginBottom: 9,
    color: '#8a6a4a',
    fontSize: 12,
    lineHeight: 18,
  },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 5 },
  slot: {
    width: '15.5%',
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#a8c3a4',
    borderRadius: 9,
    backgroundColor: '#ffffff',
  },
  slotIcono: { position: 'absolute', top: 2, right: 2 },
  slotSeleccionado: { borderColor: '#0f3e17', borderWidth: 2.5, backgroundColor: '#e8f3e4' },
  slotOcupado: { backgroundColor: colorOcupadoFondo, borderColor: colorOcupadoBorde },
  slotPasado: { backgroundColor: '#f1f2ef', borderColor: '#e3e5e1' },
  slotText: { color: '#1e3326', fontSize: 12, fontWeight: '600' },
  slotTextSeleccionado: { color: '#0f3e17', fontWeight: 'bold' },
  slotTextOcupado: { color: colorOcupadoTexto },
  slotTextPasado: { color: '#a9afa8' },
  mensajeError: { marginTop: 12, color: '#a32828', fontSize: 13, lineHeight: 19 },
  confirmar: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  confirmarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' },
  avisoRaiz: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avisoFondo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 32, 22, 0.55)',
  },
  aviso: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    borderRadius: 20,
    backgroundColor: '#fffefc',
  },
  avisoIcono: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderRadius: 36,
    backgroundColor: '#1f6b33',
  },
  avisoTitulo: {
    color: '#0f3e17',
    fontSize: 21,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  avisoSubtitulo: {
    marginTop: 6,
    color: '#5c6b60',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  avisoDatos: {
    alignSelf: 'stretch',
    gap: 9,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f1f7ee',
  },
  avisoDato: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avisoDatoTexto: { flex: 1, color: '#1e3326', fontSize: 14, textTransform: 'capitalize' },
  avisoBoton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  avisoBotonTexto: { color: '#fffefc', fontSize: 16, fontWeight: 'bold' },
});
