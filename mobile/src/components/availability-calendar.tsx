import {
  forwardRef,
  useCallback,
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
  direccionesSedes,
  DIAS_SEMANA,
  sedesVeterinaria,
  type SedeVeterinaria,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import { estilos } from '@/lib/estilos';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';

const tiposTurno = ['Control', 'Vacunas', 'Estética'] as const;

// El encabezado de dias vive en lib/datos para que los tres calendarios
// muestren las mismas letras. Antes cada uno tenia su copia y al cambiar el
// miércoles se olvidó uno.

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
// Dia de la semana (getDay) que la veterinaria tiene completo: no se atiende
// ningun turno. El domingo (0) ya venia bloqueado; este es aparte porque el
// miercoles se puede ABRIR para ver que esta lleno, solo que no se puede agendar.
const DIA_BLOQUEADO = 3;

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
  /** Version mas chica, para cuando la agenda entra dentro de otra pantalla. */
  compacta?: boolean;
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
  /**
   * No agenda nada: valida lo elegido y se da por hecho que se pudo guardar.
   * Lo usa la pantalla de atencion mientras todavia no sincroniza.
   */
  simular?: boolean;
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

export const AvailabilityCalendar = forwardRef<AgendaHandle, Props>(
  function AvailabilityCalendar(
    {
      onTurnoGuardado,
      onTurnoCerrado,
      escala = 1,
      mascotaIdFija = null,
      mascotaNombreFija,
      sedeFija = null,
      compacta = false,
      ocultarBotonGuardar = false,
      comoAdmin = false,
      ocultarAviso = false,
      simular = false,
    },
    ref
  ) {
    const [mesVisible, setMesVisible] = useState(() => {
      const hoy = new Date();
      return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });
    const [fechaSeleccionada, setFechaSeleccionada] = useState(() =>
      primerDiaAgendable(new Date())
    );
    // Con sedeFija arranca en esa sede y el selector desaparece.
    const [sede, setSede] = useState<SedeVeterinaria>(sedeFija ?? 'Recoleta');
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
    }, [mascotaIdFija]);

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

    // El dia bloqueado se puede abrir pero no tiene ningun horario bookeable.
    // Sin esto, abrir el miercoles dejaba los slots habilitados y el boton de
    // guardar activo: el error saltaria recien al confirmar, en el servidor.
    const seleccionBloqueada =
      fechaSeleccionada !== '' &&
      new Date(`${fechaSeleccionada}T12:00:00`).getDay() === DIA_BLOQUEADO;

    const confirmar = useCallback(async (): Promise<boolean> => {
      if (guardando) return false;
      setMensajeError('');

      const mascotaAUsar = mascotaIdFija ?? mascotaId;

      if (seleccionBloqueada) {
        setMensajeError('Los miércoles están completos y no se atienden turnos.');
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

      // En modo simulacion se pasa todo lo que falta y no se toca la base. La
      // disponibilidad si se consulta, asi los horarios ocupados se ven bien.
      if (simular) return true;

      setGuardando(true);
      try {
        const usuario = await obtenerUsuarioActual();
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
    }, [
      ahoraMinutos,
      cargarDisponibilidad,
      comoAdmin,
      fechaSeleccionada,
      guardando,
      horaSeleccionada,
      seleccionBloqueada,
      hoyValor,
      mascotas,
      mascotaId,
      mascotaIdFija,
      mascotaSeleccionada,
      ocultarAviso,
      onTurnoGuardado,
      ocupadosDia,
      sede,
      simular,
      tipo,
    ]);

    const cerrarAviso = () => {
      setTurnoCreado(null);
      onTurnoCerrado?.();
    };

    const puedeConfirmar =
      !guardando &&
      !cargando &&
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

    // Medidas que se comprimen con la escala para que el formulario entre entero.
    // En modo compacto los pisos son mas bajos porque la agenda va dentro de otra
    // pantalla y no hay espacio para holguras.
    //
    // Los pisos importan: con 0.30 y 0.31, en una pantalla de 600px de alto el
    // calendario ya no entraba mas y el formulario se cortaba. Con 24 y 26
    // sigue entrando y los numeros todavia se leen.
    const altoDia = Math.max(18, Math.round((compacta ? 32 : 36) * escala));
    const altoSlot = Math.max(20, Math.round((compacta ? 32 : 36) * escala));
    const diaText = Math.max(10, Math.round((compacta ? 12 : 13) * escala));
    const slotText = Math.max(9, Math.round((compacta ? 11 : 12) * escala));
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

    // Cuando sede y mascota vienen fijas ya se saben: la pantalla de atencion
    // las muestra en el encabezado, asi que repetirlas aca es al pedo.
    const ocultarFilaCampos = compacta && sedeFija !== null && mascotaIdFija !== null;

    const cuerpoAgenda: ReactNode = (
      <>
        {ocultarFilaCampos ? null : (
          <View style={styles.filaCampos}>
            <View style={styles.columnaCampo}>
              {sedeFija ? (
                <>
                  {compacta ? null : <Text style={styles.label}>Sede</Text>}
                  <View
                    style={[styles.mascotaFijaCampo, compacta && styles.mascotaFijaCampoCompacto]}
                    accessibilityLabel={`Sede ${sedeFija}`}
                  >
                    <View style={[styles.mascotaFijaIcono, compacta && styles.mascotaFijaIconoCompacto]}>
                      <Ionicons name="location" size={14} color="#0f3e17" />
                    </View>
                    <Text
                      style={[styles.mascotaFijaTexto, compacta && styles.mascotaFijaTextoCompacto]}
                      numberOfLines={1}
                    >
                      {sedeFija}
                    </Text>
                  </View>
                </>
              ) : (
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
              )}
            </View>

            {mascotaIdFija || mascotaNombreFija ? (
              <View style={styles.columnaCampo}>
                {compacta ? null : <Text style={styles.label}>Mascota</Text>}
                <View
                  style={[styles.mascotaFijaCampo, compacta && styles.mascotaFijaCampoCompacto]}
                  accessibilityLabel={`Mascota ${
                    mascotaSeleccionada?.titulo ?? mascotaNombreFija ?? 'del turno'
                  }`}
                >
                  <View style={[styles.mascotaFijaIcono, compacta && styles.mascotaFijaIconoCompacto]}>
                    <Ionicons name="paw" size={15} color="#5f7d63" />
                  </View>
                  <Text
                    style={[styles.mascotaFijaTexto, compacta && styles.mascotaFijaTextoCompacto]}
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
        {compacta || sedeFija ? null : (
          <View style={[styles.direccionSede, { marginTop: hueco(7), marginBottom: hueco(10) }]}>
            <Ionicons name="location-outline" size={12} color="#0f3e17" />
            <Text style={styles.direccionTexto} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.direccionEtiqueta}>Dirección: </Text>
              {direccionesSedes[sede]}
            </Text>
          </View>
        )}

        {compacta ? null : <Text style={styles.label}>Tipo de turno</Text>}
        <View
          style={[
            styles.tiposFila,
            compacta && styles.tiposFilaCompacto,
            !compacta && { marginBottom: hueco(10) },
          ]}
        >
          {tiposTurno.map((opcion) => {
            const seleccionado = tipo === opcion;
            return (
              <Pressable
                key={opcion}
                style={({ pressed }) => [
                  styles.tipoOpcion,
                  compacta && styles.tipoOpcionCompacto,
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

        <View
          style={[
            styles.monthRow,
            compacta && styles.monthRowCompacto,
            !compacta && { marginTop: hueco(10), marginBottom: hueco(8) },
          ]}
        >
          <Pressable
            style={styles.monthButton}
            onPress={() => moverMes(-1)}
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
          >
            <Text style={[styles.arrow, compacta && styles.arrowCompacto]}>‹</Text>
          </Pressable>
          <Text style={[styles.month, compacta && styles.monthCompacto]}>
            {mesVisible.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable
            style={styles.monthButton}
            onPress={() => moverMes(1)}
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
          >
            <Text style={[styles.arrow, compacta && styles.arrowCompacto]}>›</Text>
          </Pressable>
        </View>

        <View style={styles.calendar}>
          {DIAS_SEMANA.map((dia, index) => (
            <Text
              key={`weekday-${index}`}
              style={[styles.weekday, compacta && styles.weekdayCompacto]}
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
            const esDomingo = date.getDay() === 0;
            // Los miercoles la veterinaria esta completa: no se atienden turnos.
            // NO va en `deshabilitado`: el dia se puede abrir para ver que esta
            // lleno, pero adentro no hay ningun horario bookeable.
            const esDiaBloqueado = date.getDay() === DIA_BLOQUEADO;
            const completos = ocupados >= horariosDisponibles.length;
            // Un dia sin horarios igual se puede abrir para ver que esta lleno,
            // asi que no cuenta como deshabilitado: solo se ve distinto.
            const deshabilitado = esPasado || esDomingo || cargando || Boolean(error);
            const seleccionado = fechaSeleccionada === value;
            // La celda reserva la franja de abajo para el puntito, asi el numero
            // sube y no queda pegado a el.
            const llevaPuntito =
              !esPasado && !seleccionado &&
              (esDiaBloqueado || (ocupados > 0 && !esDomingo));
            const nombreMes = mesVisible.toLocaleDateString('es-AR', { month: 'long' });
            return (
              <Pressable
                key={`day-${dia}`}
                style={[
                  styles.day,
                  { height: altoDia },
                  seleccionado && styles.selectedDay,
                  llevaPuntito && { paddingBottom: franjaPuntito },
                ]}
                onPress={() => {
                  setFechaSeleccionada(value);
                  setHoraSeleccionada('');
                  setMensajeError('');
                }}
                disabled={deshabilitado}
                accessibilityRole="button"
                accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                accessibilityLabel={`${dia} de ${nombreMes}${esDiaBloqueado ? ', sin turnos, día completo' : completos ? ', sin horarios disponibles' : ocupados > 0 ? `, ${ocupados} horarios ocupados` : ', todos los horarios disponibles'}${esDomingo ? ', no se atienden domingos' : ''}${esPasado ? ', fecha pasada' : ''}`}
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
                {/* El puntito marca que el dia ya tiene horarios tomados. No va en
                    los pasados ni en los domingos porque no se pueden agendar, ni en
                    el que esta elegido porque el fondo oscuro ya lo dice.
                    Los miercoles llevan puntito rojo: el dia se puede abrir pero
                    esta completo, y el verde de "tiene turno" los confundiria
                    con un dia con disponibilidad. */}
                {esDiaBloqueado && !esPasado && !seleccionado ? (
                  <View
                    style={[
                      styles.bloqueoDot,
                      { width: altoPuntito, height: altoPuntito, bottom: margenPuntito },
                    ]}
                  />
                ) : ocupados > 0 && !esPasado && !esDomingo && !seleccionado ? (
                  <View
                    style={[
                      styles.busyDot,
                      { width: altoPuntito, height: altoPuntito, top: margenPuntito, right: margenPuntito },
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {compacta ? null : (
          <View style={[styles.legend, !compacta && { marginTop: hueco(12) }]}>
            <View style={styles.legendLibre} />
            <Text style={styles.legendText}>Libre</Text>
            <View style={styles.legendOcupado} />
            <Text style={styles.legendText}>Ocupado</Text>
            <View style={styles.legendCompleto} />
            <Text style={styles.legendText}>Completo</Text>
            <View style={styles.legendPasado} />
            <Text style={styles.legendText}>Pasado</Text>
          </View>
        )}

        <View
          style={[
            styles.timesSection,
            compacta && styles.timesSectionCompacto,
            !compacta && { marginTop: hueco(12), paddingTop: hueco(12) },
          ]}
        >
          {/* En compacto el dia ya se ve marcado en el calendario, asi que el
              titulo con la fecha es al第四次. */}
          {compacta ? null : (
            <Text style={styles.timesTitle}>
              Horarios del{' '}
              {fechaSeleccionada
                ? new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR')
                : 'día seleccionado'}
            </Text>
          )}
          {cargando ? (
            <ActivityIndicator color="#0f3e17" style={styles.cargandoBloque} />
          ) : error ? (
            <Text style={estilos.cardSubtitle}>{error}</Text>
          ) : !fechaSeleccionada ? (
            <Text style={estilos.cardSubtitle}>Elegí una fecha para ver los horarios.</Text>
          ) : (
            <View>
              {seleccionBloqueada ? (
                <Text style={styles.sinHoras}>
                  Los miércoles están completos y no se atienden turnos. Probá con
                  otro día.
                </Text>
              ) : !hayHorasLibres ? (
                <Text style={styles.sinHoras}>
                  No hay ningún horario libre para esta fecha. Probá con otro día.
                </Text>
              ) : null}
              <View style={[styles.slotsGrid, { gap: gapSlot }]}>
                {horariosDisponibles.map((hora) => {
                  const ocupado = ocupadosDia.has(hora) || seleccionBloqueada;
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

        {ocultarBotonGuardar ? null : (
          <Pressable
            style={({ pressed }) => [
              styles.confirmar,
              compacta && styles.confirmarCompacto,
              !compacta && { marginTop: hueco(12), paddingVertical: Math.max(11, hueco(15)) },
              !puedeConfirmar && estilos.buttonPressed,
              pressed && puedeConfirmar && estilos.buttonPressed,
            ]}
            onPress={() => void confirmar()}
            disabled={!puedeConfirmar}
            accessibilityRole="button"
            accessibilityLabel="Guardar turno"
            accessibilityState={{ disabled: !puedeConfirmar, busy: guardando }}
          >
            <Text style={[styles.confirmarTexto, compacta && styles.confirmarTextoCompacto]}>
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
            styles.card,
            compacta && styles.cardCompacto,
            !compacta && { paddingBottom: hueco(12) },
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
  cardCompacto: { paddingHorizontal: 0, paddingBottom: 0 },
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
  mascotaFijaCampoCompacto: {
    minHeight: 36,
    gap: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
  },
  mascotaFijaIcono: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#e4f1e0',
  },
  mascotaFijaIconoCompacto: { width: 22, height: 22, borderRadius: 7 },
  mascotaFijaTexto: { flex: 1, color: '#1e3326', fontSize: 14, fontWeight: '600' },
  mascotaFijaTextoCompacto: { fontSize: 13 },
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
  tiposFilaCompacto: { gap: 5, marginTop: 6, marginBottom: 6 },
  tipoOpcion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  tipoOpcionCompacto: { paddingVertical: 6, borderRadius: 10 },
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
  monthRowCompacto: { marginTop: 6, marginBottom: 4 },
  monthButton: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#0f3e17', fontSize: 26, fontWeight: '600' },
  arrowCompacto: { fontSize: 21 },
  month: { color: '#263b32', fontSize: 15, fontWeight: 'bold', textTransform: 'capitalize' },
  monthCompacto: { fontSize: 14 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: {
    width: '14.2857%',
    paddingVertical: 5,
    color: '#69746a',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  weekdayCompacto: { paddingVertical: 1, fontSize: 11 },
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
  // Puntito de "este dia ya tiene horarios tomados". Solo se muestra en los dias
// que todavia tienen alguna hora libre.
  busyDot: {
    position: 'absolute',
    borderRadius: 3,
    backgroundColor: colorOcupadoBorde,
  },
  // Puntito de "dia completo, no se puede agendar". Rojo a proposito: el verde
  // del busyDot significa "tiene turno pero igual hay lugar", y el miercoles
  // no hay lugar de ningun tipo.
  bloqueoDot: {
    position: 'absolute',
    borderRadius: 3,
    backgroundColor: '#c0392b',
  },
  // Casilla de la leyenda para el dia completo (miercoles). Mismo rojo que el
  // puntito del calendario, asi se leen como la misma señal.
  // Relleno solido, no un rosa mas: asi se lee de un vistazo contra el
  // cuadrado del horario ocupado, que es crema.
  legendCompleto: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#7d1f14',
    backgroundColor: '#c0392b',
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
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#a8c3a4',
    backgroundColor: '#ffffff',
  },
  legendOcupado: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#a36a3c',
    backgroundColor: colorOcupadoFondo,
  },
  legendPasado: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#8d958c',
    backgroundColor: '#d6dad3',
  },
  legendText: { color: '#69746a', fontSize: 12, marginRight: 6 },
  timesSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#dfe8db' },
  timesTitle: { marginBottom: 9, color: '#263b32', fontSize: 13, fontWeight: '600' },
  timesSectionCompacto: { marginTop: 6, paddingTop: 6 },
  confirmarCompacto: { marginTop: 8, paddingVertical: 10 },
  sinHoras: {
    marginBottom: 9,
    color: '#8a6a4a',
    fontSize: 12,
    lineHeight: 18,
  },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 5 },
  slot: {
    // 15% y no 15.5: con 15.5% entran 5 por fila y los 18 horarios quedan en
// 5+5+5+3, con la ultima fila de 3 repartida con space-between y un hueco
// enorme en el medio. Con 15% entran 6 por fila justas (6 x 15% = 90% y 7 x 15%
// no entra), o sea 3 filas parejas de 6, sin huecos raros.
width: '15%',
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
  confirmarTextoCompacto: { fontSize: 14 },
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
