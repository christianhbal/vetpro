import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  DIAS_SEMANA,
  horariosDeSede,
  atiendeDia,
  type SedeVeterinaria,
} from '@/lib/datos';
import { useSesion } from '@/lib/sesion-context';
import { useRecordatorios } from '@/lib/recordatorios';
import { useSedes } from '@/lib/sede';
import { estilos } from '@/lib/estilos';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';

const tiposTurno = ['Control', 'Vacunas', 'Estética'] as const;


type TipoTurno = (typeof tiposTurno)[number];

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

/** Lo que quedo elegido en la agenda, para que la pantalla lo muestre. */
export type TurnoElegido = {
  tipo: TipoTurno;
  fecha: string;
  hora: string;
  sede: SedeVeterinaria;
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
  /**
   * Cuando viene, el selector de mascota queda fijo en esa. Se usa para
   * agendar el seguimiento de un turno ya atendido.
   */
  mascotaIdFija?: number | null;
  /** Cuando viene, la sede queda fija en esa, sin selector. */
  sedeFija?: SedeVeterinaria | null;
  /** Nombre a mostrar cuando la mascota viene fija, por si el id no llego. */
  mascotaNombreFija?: string;
  /**
   * Oculta el boton "Guardar turno". Lo usa la pantalla de atencion, que ya
   * tiene su propio boton y hace las dos cosas juntas.
   */
  ocultarBotonGuardar?: boolean;
  /**
   * Agenda en nombre de un cliente. El admin no es el dueño de la mascota, asi
   * que el turno va por un endpoint propio en vez de POST /api/turnos.
   */
  comoAdmin?: boolean;
  /**
   * No muestra el aviso de turno creado, porque quien lo muestra es la pantalla
   * que contiene la agenda.
   */
  ocultarAviso?: boolean;

};

/** Lo que la pantalla que contiene la agenda puede pedirle. */
export type AgendaHandle = {
  /** Guarda el turno elegido. Devuelve false si faltaba algo o falló la API. */
  guardar: () => Promise<boolean>;
  /** True cuando ya se eligió tipo, fecha y hora y se puede guardar. */
  listo: boolean;
  /** Lo elegido en la agenda, para mostrarlo en el aviso de la pantalla. */
  elegido: TurnoElegido | null;
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

export const AvailabilityCalendar = forwardRef<AgendaHandle, Props>(
  function AvailabilityCalendar(
    {
      onTurnoGuardado,
      onTurnoCerrado,
      escala = 1,
      mascotaIdFija = null,
      mascotaNombreFija,
      sedeFija = null,
      ocultarBotonGuardar = false,
      comoAdmin = false,
      ocultarAviso = false,
    },
    ref
  ) {
  const sincronizarRecordatorios = useRecordatorios();
  const { usuario: usuarioSesion } = useSesion();
    const [mesVisible, setMesVisible] = useState(() => {
      const hoy = new Date();
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });
    const [fechaSeleccionada, setFechaSeleccionada] = useState(() =>
      fechaComoValor(new Date())
    );
    // Con sedeFija arranca en esa sede y el selector desaparece.
    const [sede, setSede] = useState<SedeVeterinaria>(sedeFija ?? '');
    const { sedes, errorSedes, cargandoSedes } = useSedes();
    const configuracionSede = sedes.find((item) => item.nombre === sede);
    const horariosDisponibles = useMemo(() => horariosDeSede(configuracionSede), [configuracionSede]);
    const direccionesSedes = Object.fromEntries(sedes.map((item) => [item.nombre, item.direccion]));
    useEffect(() => {
      if (!sedeFija && sede && !sedes.some((item) => item.nombre === sede)) setSede('');
    }, [sedes, sede, sedeFija]);
    const [horariosOcupados, setHorariosOcupados] = useState<HorarioOcupado[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    const [mascotas, setMascotas] = useState<MascotaPropia[]>([]);
    const [cargandoMascotas, setCargandoMascotas] = useState(true);
    const [errorMascotas, setErrorMascotas] = useState('');
    const [mascotaId, setMascotaId] = useState<number | null>(null);
    const [tipo, setTipo] = useState<TipoTurno | ''>('');
    const [horaSeleccionada, setHoraSeleccionada] = useState('');
    const [anchoHorarios, setAnchoHorarios] = useState(0);

    const [guardando, setGuardando] = useState(false);
    const [mensajeError, setMensajeError] = useState('');
    const [turnoCreado, setTurnoCreado] = useState<TurnoCreado | null>(null);
    const solicitud = useRef(0);

    const cargarDisponibilidad = useCallback(async () => {
      const idSolicitud = ++solicitud.current;
      if (!sede) { setCargando(false); return; }
      const mes = `${mesVisible.getFullYear()}-${String(mesVisible.getMonth() + 1).padStart(2, '0')}`;
      setCargando(true);
      setError('');
      setHorariosOcupados([]);
      try {
        const usuario = usuarioSesion;
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
    }, [fechaSeleccionada, mesVisible, sede, usuarioSesion]);

    useFocusEffect(
      useCallback(() => {
        void cargarDisponibilidad();
      }, [cargarDisponibilidad])
    );

    const cargarMascotas = useCallback(async () => {
      // Con la mascota fija no hace falta la lista: es la de un cliente y no
      // va a estar entre las del admin. Se evita el pedido.
      if (mascotaIdFija !== null) {
        setMascotas([]);
        setCargandoMascotas(false);
        return;
      }
      setCargandoMascotas(true);
      setErrorMascotas('');
      try {
        const usuario = usuarioSesion;
        if (!usuario) {
          throw new Error('Inicia sesión para elegir una mascota.');
        }
        const response = await fetch(
          `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`,
          { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
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
    }, [mascotaIdFija, usuarioSesion]);

    useFocusEffect(
      useCallback(() => {
        void cargarMascotas();
      }, [cargarMascotas])
    );

    const opcionesSede: OpcionSelector[] = useMemo(
      () =>
        sedes.map((item) => ({
          valor: item.nombre,
          titulo: item.nombre,
        })),
      [sedes]
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

// Con mascotaIdFija el selector queda bloqueado en esa mascota, que es lo que
    // se usa al agendar el seguimiento de un turno ya atendido.
    //
    // Ojo: esa mascota es de un cliente, no del admin que esta agendando, asi
    // que no aparece en la lista de /api/mascotas. Cuando no esta, se arma la
    // opcion a mano con el nombre que trae el turno.
    const mascotaSeleccionada = useMemo(() => {
      const idBuscado = String(mascotaIdFija ?? mascotaId);
      const enMiLista = opcionesMascota.find((opcion) => opcion.valor === idBuscado);
      if (enMiLista) return enMiLista;
      if (mascotaIdFija === null) return null;
      return { valor: idBuscado, titulo: mascotaNombreFija ?? 'Mascota del turno', detalle: '' };
    }, [mascotaId, mascotaIdFija, mascotaNombreFija, opcionesMascota]);

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
    }, [horariosOcupados, horariosDisponibles]);

    const ocupadosDia = useMemo(
      () =>
        new Set(
          horariosOcupados
            .filter(
              (slot) => slot.fecha === fechaSeleccionada && horariosDisponibles.includes(slot.hora)
            )
            .map((slot) => slot.hora)
        ),
      [fechaSeleccionada, horariosOcupados, horariosDisponibles]
    );

    const moverMes = (cantidad: number) => {
      setFechaSeleccionada('');
      setHoraSeleccionada('');
      setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1));
    };

    const horariosVisibles = horariosDisponibles.filter(
      (hora) => fechaSeleccionada !== hoyValor || horaComoMinutos(hora) > ahoraMinutos
    );
    const hayHorasLibres = horariosVisibles.some((hora) => !ocupadosDia.has(hora));

    const seleccionBloqueada =
      fechaSeleccionada !== '' &&
      !atiendeDia(configuracionSede, new Date(`${fechaSeleccionada}T12:00:00`));

    const confirmar = useCallback(async (): Promise<boolean> => {
      if (guardando) return false;
      setMensajeError('');

      const mascotaAUsar = mascotaIdFija ?? mascotaId;

      if (cargando || cargandoSedes || error || errorSedes || !configuracionSede || !horariosDisponibles.includes(horaSeleccionada)) {
        setMensajeError('Elegí un horario disponible de la sede.');
        return false;
      }
      if (seleccionBloqueada) {
        setMensajeError('La sede no atiende en ese día.');
        return false;
      }
      if (mascotaAUsar === null || !mascotaSeleccionada) {
        setMensajeError('Elegí la mascota del turno.');
        return false;
      }
      if (!tipo) {
        setMensajeError('Elegí el tipo de turno.');
        return false;
      }
      if (!fechaSeleccionada) {
        setMensajeError('Elegí una fecha en el calendario.');
        return false;
      }
      if (!horaSeleccionada) {
        setMensajeError('Elegí un horario disponible.');
        return false;
      }
      if (ocupadosDia.has(horaSeleccionada)) {
        setMensajeError('Ese horario está ocupado. Elegí otro disponible.');
        return false;
      }
      if (fechaSeleccionada === hoyValor && horaComoMinutos(horaSeleccionada) <= ahoraMinutos) {
        setMensajeError('Ese horario ya pasó. Elegí otro disponible.');
        return false;
      }

      setGuardando(true);
      try {
        const usuario = usuarioSesion;
        if (!usuario) {
          throw new Error('Inicia sesión para guardar el turno.');
        }
        // El admin agenda en nombre de un cliente, asi que va por su propio endpoint:
        // POST /api/turnos exige que la mascota sea del que esta llamando.
        const response = await fetch(
          `${API_BASE_URL}${comoAdmin ? '/api/admin/turnos' : '/api/turnos'}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${usuario.accessToken}`,
            },
            body: JSON.stringify({
              ...(comoAdmin ? {} : { userId: usuario.id }),
              mascotaId: mascotaAUsar,
              tipo,
              sede,
              fecha: fechaSeleccionada,
              hora: horaSeleccionada,
            }),
          }
        );
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
          return false;
        }

        const mascota = mascotas.find((item) => item.id === mascotaAUsar);
        // Con ocultarAviso no se muestra nada: el aviso lo pone la pantalla de
        // atencion, que ademas muestra como quedo el turno original.
        if (!ocultarAviso) {
          setTurnoCreado({
            mascota: mascota?.nombre ?? mascotaSeleccionada.titulo,
            especie: mascotaSeleccionada.detalle ?? '',
            tipo,
            sede,
            fecha: fechaSeleccionada,
            hora: horaSeleccionada,
          });
        }
        setHoraSeleccionada('');
        if (!comoAdmin) void sincronizarRecordatorios();
        void cargarDisponibilidad();
        onTurnoGuardado?.();
        return true;
      } catch (requestError) {
        setMensajeError(
          requestError instanceof TypeError
            ? apiUnreachableMessage(requestError)
            : requestError instanceof Error
              ? requestError.message
              : apiUnreachableMessage(requestError)
        );
        return false;
      } finally {
        setGuardando(false);
      }
    }, [guardando, mascotaIdFija, mascotaId, cargando, cargandoSedes, error, errorSedes, configuracionSede, horariosDisponibles, horaSeleccionada, seleccionBloqueada, mascotaSeleccionada, tipo, fechaSeleccionada, ocupadosDia, hoyValor, ahoraMinutos, usuarioSesion, comoAdmin, sede, mascotas, ocultarAviso, sincronizarRecordatorios, cargarDisponibilidad, onTurnoGuardado]);

    const cerrarAviso = () => {
      setTurnoCreado(null);
      onTurnoCerrado?.();
    };

    const puedeConfirmar =
      !guardando &&
      !cargando &&
      !cargandoSedes &&
      !errorSedes &&
      !error &&
      !seleccionBloqueada &&
      mascotaSeleccionada !== null &&
      tipo !== '' &&
      fechaSeleccionada !== '' &&
      horaSeleccionada !== '' &&
      !ocupadosDia.has(horaSeleccionada) &&
      !(
        fechaSeleccionada === hoyValor &&
        horaComoMinutos(horaSeleccionada) <= ahoraMinutos
      );

    // La pantalla de atencion guarda el turno de seguimiento con su propio
    // boton, asi que le prestamos el guardado y le decimos si esta completo.
    const elegido: TurnoElegido | null =
      tipo !== '' &&
      fechaSeleccionada !== '' &&
      horaSeleccionada !== '' &&
      !seleccionBloqueada
        ? { tipo, fecha: fechaSeleccionada, hora: horaSeleccionada, sede }
        : null;
    useImperativeHandle(ref, () => ({ guardar: confirmar, listo: puedeConfirmar, elegido }));

    // Mantener el calendario legible también en pantallas chicas.
    const altoDia = Math.max(36, Math.round(36 * escala));
    const altoSlot = Math.max(44, Math.round(46 * escala));
    const diaText = Math.max(14, Math.round(13 * escala));
    const slotText = Math.max(12, Math.round(13 * escala));
    const gapSlot = Math.max(3, Math.round(5 * escala));

    // Los margenes tambien se comprimen. Antes eran fijos: en un iPhone SE
    // (375x667, unos 580px utiles) el formulario no entra ni con la grilla
    // comprimida al limite, porque los huecos entre bloques se suman.
    const esp = Math.max(0.55, Math.min(1.2, escala));
    const hueco = (valor: number) => Math.max(4, Math.round(valor * esp));

    // El puntito de "dia con turno" y el rojo de "dia completo" van abajo, como
    // siempre. Para que no se le suba encima del numero cuando la celda se
    // comprime, la celda reserva la franja de abajo y el numero sube.
    const altoPuntito = Math.max(4, Math.round(altoDia * 0.16));
    const margenPuntito = Math.max(2, Math.round(altoDia * 0.1));
    const franjaPuntito = altoPuntito + margenPuntito;


    const estilosAdaptados = StyleSheet.create({
    direccion: { marginTop: hueco(7), marginBottom: hueco(10) },
    tipos: { marginBottom: hueco(10) },
    mes: { marginTop: hueco(10), marginBottom: hueco(8) },
    dia: { height: altoDia },
    diaConPunto: { paddingBottom: franjaPuntito },
    textoDia: { fontSize: diaText },
    leyenda: { marginTop: hueco(12) },
    horarios: { marginTop: hueco(12), paddingTop: hueco(12) },
    grillaHorarios: { gap: gapSlot },
    horario: {
                          minHeight: altoSlot,
                          ...(anchoHorarios > 0
                            ? { width: Math.floor(((anchoHorarios - gapSlot * 3) / 4) * 100) / 100 }
                            : {}),
                        },
    textoHorario: { fontSize: slotText },
    confirmar: { marginTop: hueco(12), paddingVertical: Math.max(11, hueco(15)) },
    tarjeta: { paddingBottom: hueco(12) },
  });

  const cuerpoAgenda: ReactNode = (
      <>
          {sedeFija && mascotaIdFija ? null : (
          <View style={styles.filaCampos}>
            {!sedeFija ? <View style={styles.columnaCampo}>
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
            </View> : null}

            {mascotaIdFija ? null : mascotaNombreFija ? (
              <View style={styles.columnaCampo}>
                <Text style={styles.label}>Mascota</Text>
                <View
                  style={[styles.mascotaFijaCampo]}
                  accessibilityLabel={`Mascota ${
                    mascotaSeleccionada?.titulo ?? mascotaNombreFija ?? 'del turno'
                  }`}
                >
                  <View style={[styles.mascotaFijaIcono]}>
                    <Ionicons name="paw" size={15} color="#5f7d63" />
                  </View>
                  <Text
                    style={[styles.mascotaFijaTexto]}
                    numberOfLines={1}
                  >
                    {mascotaSeleccionada?.titulo ?? mascotaNombreFija ?? 'Mascota del turno'}
                  </Text>
                </View>
              </View>
            ) : (
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
          )}
          </View>
          )}


        {/* Direccion de la sede elegida. Va en una linea propia y en letra chica
            para no desarmar la fila de dos columnas: dentro de la columna de Sede
            los dos selectores quedaban desalineados. */}
        {sedeFija || !configuracionSede ? null : (
          <View style={[styles.direccionSede, estilosAdaptados.direccion]}>
            <Ionicons name="location-outline" size={12} color="#0f3e17" />
            <Text style={styles.direccionTexto} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.direccionEtiqueta}>Dirección: </Text>
              {direccionesSedes[sede]}
            </Text>
          </View>
        )}

        <Text style={styles.label}>Tipo de turno</Text>
        <View
          style={[
            styles.tiposFila,            estilosAdaptados.tipos,
          ]}
        >
          {tiposTurno.map((opcion) => {
            const seleccionado = tipo === opcion;
            return (
              <Pressable
                key={opcion}
                style={({ pressed }) => [
                  styles.tipoOpcion,                  seleccionado && styles.tipoOpcionSeleccionada,
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

        <View
          style={[
            styles.monthRow,            estilosAdaptados.mes,
          ]}
        >
          <Pressable
            style={styles.monthButton}
            onPress={() => moverMes(-1)}
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
          >
            <Text style={[styles.arrow]}>‹</Text>
          </Pressable>
          <Text style={[styles.month]}>
            {mesVisible.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable
            style={styles.monthButton}
            onPress={() => moverMes(1)}
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
          >
            <Text style={[styles.arrow]}>›</Text>
          </Pressable>
        </View>

        <View style={styles.calendar}>
          {DIAS_SEMANA.map((dia, index) => (
            <Text
              key={`weekday-${index}`}
              style={[styles.weekday]}
            >
              {dia}
            </Text>
          ))}
          {dias.map((dia, index) => {
            if (dia === null) return <View key={`empty-${index}`} style={styles.day} />;
            const date = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
            const value = fechaComoValor(date);
            const ocupados = ocupadosPorDia.get(value) ?? 0;
            const esPasado = value < hoyValor;
            const esDiaBloqueado = Boolean(configuracionSede) && !atiendeDia(configuracionSede, date);
            const completos = horariosDisponibles.length > 0 && ocupados >= horariosDisponibles.length;
            const deshabilitado = !configuracionSede || esPasado || esDiaBloqueado || cargando || Boolean(error);
            const seleccionado = Boolean(configuracionSede) && fechaSeleccionada === value;
            const llevaPuntito = completos && !seleccionado && !cargando && !error;
            const nombreMes = mesVisible.toLocaleDateString('es-AR', { month: 'long' });
            return (
              <Pressable
                key={`day-${dia}`}
                style={[
                  styles.day,
                  estilosAdaptados.dia,
                  seleccionado && styles.selectedDay,
                  llevaPuntito && estilosAdaptados.diaConPunto,
                ]}
                onPress={() => {
                  setFechaSeleccionada(value);
                  setHoraSeleccionada('');
                  setMensajeError('');
                }}
                disabled={deshabilitado}
                accessibilityRole="button"
                accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                accessibilityLabel={`${dia} de ${nombreMes}${!configuracionSede ? ', elegí una sede' : esDiaBloqueado ? ', sin atención' : completos ? ', sin horarios disponibles' : ocupados > 0 ? `, ${ocupados} horarios ocupados` : ', todos los horarios disponibles'}${esPasado ? ', fecha pasada' : ''}`}
              >
                <Text
                  style={[
                    styles.dayText,
                    estilosAdaptados.textoDia,
                    seleccionado && styles.selectedText,
                    deshabilitado && !seleccionado && styles.disabledText,
                  ]}
                >
                  {dia}
                </Text>
                {/* Marca las fechas con todos los horarios ocupados. */}
                {llevaPuntito ? (
                  <View
                    style={[
                      styles.bloqueoDot,
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.legend, estilosAdaptados.leyenda]}>
            <View style={styles.legendPunto} />
            <Text style={styles.legendText}>Fecha sin horarios disponibles</Text>
          </View>

        <View
          style={[
            styles.timesSection,            estilosAdaptados.horarios,
          ]}
        >
          <Text style={styles.timesTitle}>
              {configuracionSede && fechaSeleccionada
                ? `Horarios del ${new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR')}`
                : 'Horarios'}
            </Text>
          {cargando ? (
            <ActivityIndicator color="#0f3e17" style={styles.cargandoBloque} />
          ) : error ? (
            <Text style={estilos.cardSubtitle}>{error}</Text>
          ) : !configuracionSede ? (
            <Text style={estilos.cardSubtitle}>Elegí una sede para ver los horarios.</Text>
          ) : !fechaSeleccionada ? (
            <Text style={estilos.cardSubtitle}>Elegí una fecha para ver los horarios.</Text>
          ) : (
            <View>
              {seleccionBloqueada ? (
                <Text style={styles.sinHoras}>
                  La sede no atiende este día. Probá con otro día.
                </Text>
              ) : fechaSeleccionada === hoyValor && horariosVisibles.length === 0 ? (
                <Text style={styles.sinHoras}>
                  Ya no quedan horarios disponibles para hoy. Elegí otro día.
                </Text>
              ) : !hayHorasLibres ? (
                <Text style={styles.sinHoras}>
                  No hay ningún horario libre para esta fecha. Probá con otro día.
                </Text>
              ) : null}
              <View
                style={[styles.slotsGrid, estilosAdaptados.grillaHorarios]}
                onLayout={(event) => setAnchoHorarios(event.nativeEvent.layout.width)}
              >
                {horariosVisibles.map((hora) => {
                  const ocupado = ocupadosDia.has(hora) || seleccionBloqueada;
                  const deshabilitado = ocupado || guardando;
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
                        estilosAdaptados.horario,
                        seleccionado && styles.slotSeleccionado,
                        ocupado && styles.slotOcupado,
                        pressed && !deshabilitado && estilos.buttonPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                      accessibilityLabel={`${hora}${ocupado ? ', ocupado' : ', disponible'}`}
                    >
                      <Text
                        style={[
                          styles.slotText,
                          estilosAdaptados.textoHorario,
                          seleccionado && styles.slotTextSeleccionado,
                          ocupado && styles.slotTextOcupado,
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

        {errorSedes ? <Text accessibilityRole="alert" style={styles.mensajeError}>{errorSedes}</Text> : null}
        {mensajeError ? (
          <Text accessibilityRole="alert" style={styles.mensajeError}>
            {mensajeError}
          </Text>
        ) : null}

        {ocultarBotonGuardar ? null : (
          <Pressable
            style={({ pressed }) => [
              styles.confirmar,              estilosAdaptados.confirmar,
              !puedeConfirmar && estilos.buttonPressed,
              pressed && puedeConfirmar && estilos.buttonPressed,
            ]}
            onPress={() => void confirmar()}
            disabled={!puedeConfirmar}
            accessibilityRole="button"
            accessibilityLabel="Guardar turno"
            accessibilityState={{ disabled: !puedeConfirmar, busy: guardando }}
          >
            <Text style={[styles.confirmarTexto]}>
              {guardando ? 'Guardando...' : 'Guardar turno'}
            </Text>
          </Pressable>
        )}
      </>
    );

    return (
      <>
        <View
          style={[
            styles.card,            estilosAdaptados.tarjeta,
          ]}
        >
          {cuerpoAgenda}
        </View>

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
)

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 4,
    paddingBottom: 12,
    backgroundColor: '#fffefc',
  },
  filaCampos: { flexDirection: 'row', gap: 8 },
  columnaCampo: { flex: 1 },
  mascotaFijaCampo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#f3f7f1',
  },
  mascotaFijaIcono: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#e4f1e0',
  },
  mascotaFijaTexto: { flex: 1, color: '#1e3326', fontSize: 14, fontWeight: '600' },
  label: {
    marginBottom: 6,
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600',
  },
  // Pastilla en vez de texto suelto: asi se lee como un dato mas de la sede
  // y no como un texto que se colo abajo de los selectores.
  direccionSede: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 7,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dfe8db',
    backgroundColor: '#f1f7ee',
  },
  direccionTexto: { flexShrink: 1, color: '#5c6b60', fontSize: 12 },
  direccionEtiqueta: { fontWeight: '700', color: '#0f3e17' },
  cargandoBloque: { paddingVertical: 12 },
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
  bloqueoDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    bottom: 4,
    borderRadius: 3,
    backgroundColor: '#c05a32',
  },
  legendPunto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#c05a32' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  legendText: { color: '#69746a', fontSize: 13 },
  timesSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#dfe8db' },
  timesTitle: { marginBottom: 9, color: '#263b32', fontSize: 13, fontWeight: '600' },
  sinHoras: {
    marginBottom: 9,
    color: '#8a6a4a',
    fontSize: 12,
    lineHeight: 18,
  },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 5 },
  slot: {
    width: '23%',
    minHeight: 44,
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
  slotText: { color: '#1e3326', fontSize: 12, fontWeight: '600' },
  slotTextSeleccionado: { color: '#0f3e17', fontWeight: 'bold' },
  slotTextOcupado: { color: colorOcupadoTexto },
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
