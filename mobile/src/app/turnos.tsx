import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { CalendarioTurnos } from '@/components/calendario-turnos';
import TurnoDateTimeField from '@/components/turno-date-time-field';
import { estilos } from '@/lib/estilos';
import {
  formatearFechaTurno,
  turnoSiguePendiente,
  type SedeVeterinaria,
  type TurnoGuardado,
} from '@/lib/datos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';
import { sincronizarRecordatorios } from '@/lib/recordatorios';
import { useFiltroTurnos, useSedeSeleccionada, useSedes } from '@/lib/sede';


// La respuesta del admin trae turno ajeno y estado de atención; el usuario
// normal solo ve los suyos.
type TurnoLista = TurnoGuardado & {
  atendidoEn?: string | null;
  descripcion?: string | null;
  esDemo?: boolean;
  /** Ocupa la agenda pero no se muestra en las listas de esta pantalla. */
  ocultoEnAgenda?: boolean;
  user?: { nombre: string } | null;
};

type CitaLista = {
  id: number;
  key: string;
  mascota: string;
  motivo: string;
  fecha: string;
  hora: string;
  dueno: string | null;
  atendido: boolean;
  descripcion: string | null;
  guardado: TurnoLista;
};

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia}/${mes}`;
}

type SelloTurno = 'atendido' | 'enSede';

function selloDe(turno: TurnoLista): SelloTurno | null {
  if (turno.atendidoEn !== null && turno.atendidoEn !== undefined) return 'atendido';
  if (turno.llegadaEn !== null && turno.llegadaEn !== undefined) return 'enSede';
  return null;
}

const TEXTOS_SELLO: Record<SelloTurno, string> = {
  atendido: 'Atendido',
  enSede: 'En la sede',
};

const TIPOS_TURNO = ['Control', 'Vacunas', 'Estética'];

/** Un horario tomado, como lo devuelve GET /api/turnos/disponibilidad. */
type HorarioOcupado = { fecha: string; hora: string };

function esHorarioOcupado(value: unknown): value is HorarioOcupado {
  if (typeof value !== 'object' || value === null) return false;
  const horario = value as Record<string, unknown>;
  return typeof horario.fecha === 'string' && typeof horario.hora === 'string';
}

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

export default function TurnosScreen() {
  const { sedes, cargandoSedes, errorSedes } = useSedes();
  const sedesVeterinaria = sedes.map((sede) => sede.nombre);
  const direccionesSedes = Object.fromEntries(sedes.map((sede) => [sede.nombre, sede.direccion]));
  const [turnos, setTurnos] = useState<TurnoLista[]>([]);
  const [ahora, setAhora] = useState(() => new Date());
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState('');
  // Datos del turno recien guardado o cancelado, para los avisos de exito.
  const [turnoGuardado, setTurnoGuardado] = useState<{ mascota: string; texto: string } | null>(
    null
  );
  const [turnoCancelado, setTurnoCancelado] = useState<{ mascota: string; texto: string } | null>(
    null
  );
  // Modificar un turno: solo el admin, y solo sobre los que no tienen sello.
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState('Control');
  const [sedeForm, setSedeForm] = useState<SedeVeterinaria>('');
  const [fechaForm, setFechaForm] = useState('');
  const [horaForm, setHoraForm] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');
  const [horariosOcupados, setHorariosOcupados] = useState<HorarioOcupado[]>([]);
  const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);
  const [errorDisponibilidad, setErrorDisponibilidad] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [token, setToken] = useState('');
const [, setSedeCompartida] = useSedeSeleccionada();
const [filtroSede, guardarFiltro] = useFiltroTurnos(sedes, cargandoSedes, errorSedes);
const setFiltroSede = (valor: 'Todas' | SedeVeterinaria) => {
  guardarFiltro(valor);
  if (valor !== 'Todas') setSedeCompartida(valor);
};
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();

  const cargarTurnos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      setEsAdmin(usuario.esAdmin);
      setToken(usuario.accessToken);

      // El admin ve la agenda completa; el usuario, solo sus turnos.
      const response = await fetch(
        usuario.esAdmin
          ? `${API_BASE_URL}/api/admin/turnos`
          : `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`,
        { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
      );
      const resultado = await response.json();
      if (!response.ok) {
        setError(resultado.message ?? 'No se pudieron cargar los turnos.');
        setTurnos([]);
        return;
      }
      setTurnos(resultado);

      setAhora(new Date());
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setTurnos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
      void sincronizarRecordatorios();
    }, [cargarTurnos])
  );

  // El momento se guarda al cargar los datos: es la referencia para saber que
  // turnos ya pasaron su hora.
  const valorHoy = fechaComoValor(ahora);

  const aCita = (turno: TurnoLista): CitaLista => ({
    id: turno.id,
    key: `turno-${turno.id}`,
    mascota: turno.mascota.nombre,
    motivo: turno.tipo,
    fecha: formatearFechaTurno(turno.fecha, turno.hora),
    hora: turno.hora,
    dueno: turno.user?.nombre ?? null,
    atendido: turno.atendidoEn !== null && turno.atendidoEn !== undefined,
    descripcion: turno.descripcion ?? null,
    guardado: turno,
  });

  const turnosVisibles = useMemo(() => turnos.filter((turno) => !turno.esDemo), [turnos]);

  const proximos = useMemo(
    () =>
      turnosVisibles.filter(
        (turno) =>
          !turno.ocultoEnAgenda &&
          (turno.atendidoEn === null || turno.atendidoEn === undefined) &&
          (turno.llegadaEn === null || turno.llegadaEn === undefined) &&
          turnoSiguePendiente(turno, ahora)
      ),
    [turnosVisibles, ahora]
  );

  // Con un dia elegido se ve todo lo agendado para ese dia, aunque la hora ya
  // haya pasado o el turno figure atendido, y cada rol ve lo suyo:
  //  - admin: la agenda compartida de la veterinaria, tal cual la devuelve la API.
  //  - cliente: los turnos vinculados a su cuenta.
  const porDia = useMemo(
    () => turnosVisibles.filter((turno) => !turno.ocultoEnAgenda),
    [turnosVisibles]
  );

  const sedesDisponibles = useMemo(
    () => ['Todas', ...sedes.map((sede) => sede.nombre)],
    [sedes]
  );

  const turnosDelDia = useMemo(() => {
    const idsProximos = new Set(proximos.map((turno) => turno.id));
    const origen = fechaSeleccionada === null ? turnosVisibles : porDia;

    return origen
      .filter((turno) => filtroSede === 'Todas' || turno.sede === filtroSede)
      .filter((turno) =>
        fechaSeleccionada === null
          ? idsProximos.has(turno.id)
          : turno.fecha === fechaSeleccionada
      )
      // Los atendidos van al final. Lo primero que se ve es lo que falta
      // atender, que es lo que interesa; dentro de cada grupo, por hora.
      .sort((a, b) => {
        const atendidoA = a.atendidoEn !== null && a.atendidoEn !== undefined;
        const atendidoB = b.atendidoEn !== null && b.atendidoEn !== undefined;
        if (atendidoA !== atendidoB) return atendidoA ? 1 : -1;
        return a.fecha === b.fecha
          ? a.hora.localeCompare(b.hora)
          : a.fecha.localeCompare(b.fecha);
      });
  }, [fechaSeleccionada, filtroSede, porDia, proximos, turnosVisibles]);

  /**
   * Un turno se puede cancelar desde aca si todavia no se atendio y el paciente
   * no llego. Lo puede hacer el dueño de la mascota o el veterinario: es el turno
   * de ellos.

   */
const puedeCancelar =
   citaSeleccionada !== null &&
   citaSeleccionada.guardado.id > 0 &&
   (citaSeleccionada.guardado.atendidoEn === null ||
   citaSeleccionada.guardado.atendidoEn === undefined) &&
   (citaSeleccionada.guardado.llegadaEn === null ||
   citaSeleccionada.guardado.llegadaEn === undefined);

  const puedeEditar =
   esAdmin &&
   citaSeleccionada !== null &&
   citaSeleccionada.guardado.id > 0 &&
   selloDe(citaSeleccionada.guardado) === null;


  // Los horarios tomados del mes, para que el campo de hora no ofrezca uno que
  // ya esta ocupado.
  const cargarDisponibilidad = useCallback(
    async (year: number, month: number, sedeConsultada: SedeVeterinaria) => {
      const mes = `${year}-${String(month).padStart(2, '0')}`;
      setCargandoDisponibilidad(true);
      setErrorDisponibilidad('');
      setHorariosOcupados([]);
      try {
        const usuario = await obtenerUsuarioActual();
        if (!usuario) {
          throw new Error('Inicia sesión para consultar la disponibilidad.');
        }
        const response = await fetch(
          `${API_BASE_URL}/api/turnos/disponibilidad?mes=${encodeURIComponent(mes)}&sede=${encodeURIComponent(sedeConsultada)}`,
          { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
        );
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(mensajeApi(result) ?? 'No se pudo cargar la disponibilidad.');
        }
        if (!Array.isArray(result) || !result.every(esHorarioOcupado)) {
          throw new Error('La API devolvió horarios ocupados inválidos.');
        }
        setHorariosOcupados(result);
      } catch (requestError) {
        setErrorDisponibilidad(
          requestError instanceof TypeError
            ? apiUnreachableMessage(requestError)
            : requestError instanceof Error
              ? requestError.message
              : apiUnreachableMessage(requestError)
        );
      } finally {
        setCargandoDisponibilidad(false);
      }
    },
    []
  );

  const abrirEdicion = (turno: TurnoLista) => {
    setErrorGuardado('');
    setTipo(turno.tipo);
    setSedeForm(turno.sede);
    setFechaForm(turno.fecha);
    setHoraForm(turno.hora);
    setEditando(true);
    const [year, month] = turno.fecha.split('-').map(Number);
    if (year && month) void cargarDisponibilidad(year, month, turno.sede);
  };

  const horariosOcupadosEfectivos = useMemo(() => {
    if (!citaSeleccionada || sedeForm !== citaSeleccionada.guardado.sede) return horariosOcupados;
    const propio = citaSeleccionada.guardado;
    return horariosOcupados.filter(
      (horario) => !(horario.fecha === propio.fecha && horario.hora === propio.hora)
    );
  }, [citaSeleccionada, horariosOcupados, sedeForm]);

  const guardarCambios = async () => {
    if (!citaSeleccionada || guardando) return;
    setErrorGuardado('');

    // El backend tambien lo rechaza, pero avisar aca evita el viaje y deja el
    // error al lado del campo.
    if (
      `${fechaForm.trim()}T${horaForm.trim()}` <
      `${citaSeleccionada.guardado.fecha}T${citaSeleccionada.guardado.hora}`
    ) {
      setErrorGuardado(
        'No se puede mover un turno a un horario anterior. Solo se puede estirar o pizarlo para otro día.'
      );
      return;
    }

    setGuardando(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/turnos/${citaSeleccionada.guardado.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            tipo,
            sede: sedeForm,
            fecha: fechaForm.trim(),
            hora: horaForm.trim(),
          }),
        }
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        setErrorGuardado(mensajeApi(result) ?? 'No se pudo modificar el turno.');
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('id' in result) ||
        result.id !== citaSeleccionada.guardado.id
      ) {
        throw new Error('La API no confirmó los cambios del turno.');
      }

      const nombreMascota = citaSeleccionada.guardado.mascota.nombre;
      setEditando(false);
      setCitaSeleccionada(null);
      await cargarTurnos();
      // El aviso va despues de recargar, por el mismo motivo que el cancelado.
      setTurnoGuardado({
        mascota: nombreMascota,
        texto: `${tipo} · ${sedeForm} · ${fechaCorta(fechaForm.trim())} a las ${horaForm.trim()} hs`,
      });
    } catch (requestError) {
      setErrorGuardado(
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

  const cancelarTurno = async () => {
    if (!citaSeleccionada || cancelando || !token) return;
    setErrorCancelar('');

    // El motivo lo lee el dueño en la notificación del cancelación, asi que el
    // veterinario tiene que escribirlo. Al cliente no se le pide: él no le avisa
    // a nadie, el motivo no tendria a donde ir.
    const motivo = motivoCancelacion.trim();
    if (esAdmin && motivo.length < 4) {
      setErrorCancelar('Contá por qué se cancela: es lo que va a leer el dueño.');
      return;
    }

    setCancelando(true);
    try {
      // El veterinario cancela el turno de cualquiera y le avisa al dueño con un
      // motivo. El dueño cancela el suyo y no se manda aviso: le llegaría a la
      // misma persona que lo pidió.
      const respuesta = esAdmin
        ? `${API_BASE_URL}/api/admin/turnos/${citaSeleccionada.guardado.id}`
        : `${API_BASE_URL}/api/turnos/${citaSeleccionada.guardado.id}`;
      const response = await fetch(respuesta, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: esAdmin ? JSON.stringify({ motivo }) : undefined,
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const mensaje =
          typeof result === 'object' && result !== null && 'message' in result
            ? result.message
            : null;
        setErrorCancelar(
          typeof mensaje === 'string' ? mensaje : 'No se pudo cancelar el turno.'
        );
        setConfirmarCancelacion(false);
        return;
      }

      if (!esAdmin) void sincronizarRecordatorios();
      setConfirmarCancelacion(false);
      setMotivoCancelacion('');
      setCitaSeleccionada(null);
      // Se recarga la agenda para que el turno desaparezca de la lista. Si la
      // recarga falla, la pantalla avisa con su propio error y el turno sigue
      // visible: mejor eso que un cartel de "listo" con un turno que ya no se
      // puede volver a tocar.
      await cargarTurnos();
      // El aviso va despues de recargar, por el mismo motivo.
      if (esAdmin) {
        setTurnoCancelado({
          mascota: citaSeleccionada.guardado.mascota.nombre,
          texto: `${fechaCorta(citaSeleccionada.guardado.fecha)} a las ${
            citaSeleccionada.guardado.hora
          } hs`,
        });
      }
    } catch (requestError) {
      setErrorCancelar(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : 'No se pudo cancelar el turno.'
      );
      setConfirmarCancelacion(false);
    } finally {
      setCancelando(false);
    }
  };

  const altoAgendar = Math.max(74, Math.round(windowHeight * 0.1));

  const renderTurno = (cita: CitaLista) => {
    const sello = selloDe(cita.guardado);
    return (
      <Pressable
        key={cita.key}
        style={({ pressed }) => [estilos.cardTurno, pressed && estilos.buttonPressed]}
        onPress={() => setCitaSeleccionada(cita)}
        accessibilityRole="button"
        accessibilityLabel={`Ver detalle de ${cita.mascota}`}
      >
      <View style={styles.turnoFila}>
        {cita.guardado.mascota.foto ? (
          <Image
            source={{ uri: cita.guardado.mascota.foto }}
            style={styles.turnoFoto}
            resizeMode="contain"
            accessibilityLabel={`Foto de ${cita.mascota}`}
          />
        ) : (
          <View style={styles.turnoFotoVacia}>
            <Ionicons name="paw-outline" size={26} color="#0f3e17" />
          </View>
        )}
        <View style={styles.turnoTexto}>
          <View style={styles.turnoEncabezado}>
            <Text
              style={[estilos.cardTituloTurno, styles.turnoTitulo]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {cita.mascota} - {cita.motivo}
            </Text>
            {sello !== null && esAdmin ? (
              <View style={styles.sello}>
                <Text style={styles.selloTexto}>{TEXTOS_SELLO[sello]}</Text>
              </View>
            ) : null}
          </View>
          {cita.dueno ? (
            <Text style={styles.dueno} numberOfLines={1} ellipsizeMode="tail">
              {cita.dueno}
            </Text>
          ) : null}
          <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
            {/* La sede va al lado de la hora solo para el usuario normal: es el
              unico que puede tener turnos en varias sedes y necesita saber a
              cual tiene que presentarse. El admin ya tiene el filtro de sede
              arriba de la lista y ve la agenda de una sola sede, asi que la
              linea le repetia informacion. */}
          {fechaCorta(cita.guardado.fecha)} - {cita.hora} hs
          {esAdmin ? null : ` · ${cita.guardado.sede}`}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#8aa38c" />
      </View>
    </Pressable>
    );
  };

  const encabezadoSeccion = (titulo: string, citas: CitaLista[]) => (
    <View style={styles.listaEncabezado}>
      <View style={styles.listaFila}>
        <Text style={[estilos.sectionTitleTurno, styles.tituloSeccion]}>{titulo}</Text>
        {fechaSeleccionada ? (
          <Pressable
            style={({ pressed }) => [estilos.cerrarCirculo, pressed && estilos.buttonPressed]}
            onPress={() => setFechaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Volver a todos los turnos próximos"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color="#263b32" />
          </Pressable>
        ) : null}
      </View>
      <Text style={[estilos.sectionSubtitleTurno, styles.subtituloSeccion]}>
        {citas.length === 1 ? '1 turno' : `${citas.length} turnos`}
      </Text>
    </View>
  );

  const cuerpoLista = (citas: CitaLista[], vacio: string) => {
    if (cargando) {
      return <ActivityIndicator color="#2f7a3f" style={styles.cargandoLista} />;
    }
    if (error) {
      return <Text style={[estilos.cardSubtituloTurno, styles.notaVacia]}>{error}</Text>;
    }
    if (citas.length === 0) {
      return <Text style={[estilos.cardSubtituloTurno, styles.notaVacia]}>{vacio}</Text>;
    }
    return <>{citas.map(renderTurno)}</>;
  };

  const seccionLista = (titulo: string, citas: CitaLista[], vacio: string) => (
    <View style={styles.lista}>
      {encabezadoSeccion(titulo, citas)}
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator
        contentContainerStyle={styles.listaContenido}
      >
        {cuerpoLista(citas, vacio)}
      </ScrollView>
    </View>
  );

  // Un turno de un dia ya pasado no tiene sentido mostrarle la direccion ni el
  // boton "Ir": ese turno ya se hizo. Los de hoy y los de adelante si, aunque la
  // hora ya haya pasado, porque el cliente todavia tiene que ir.
  const turnoYaPaso =
    citaSeleccionada !== null && citaSeleccionada.guardado.fecha < valorHoy;

  const tituloLista = fechaSeleccionada
    ? `Turnos del ${new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}`
    : 'Turnos próximos';

  const vacioLista = fechaSeleccionada
    ? 'Ese día no tenés turnos.'
    : esAdmin
      ? 'No hay turnos próximos agendados.'
      : 'No tenés turnos próximos agendados.';

  return (
    <AppDrawer title="Turnos">
      <View style={styles.pantalla}>
        <View style={styles.cabecera}>
          <View style={styles.bloqueSede}>
            <Text style={styles.labelSede}>Sede</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filaSedes}
            >
              {sedesDisponibles.map((opcion) => {
                const seleccionada = filtroSede === opcion;
                return (
                  <Pressable
                    key={opcion}
                    onPress={() => {
                      setFiltroSede(opcion as 'Todas' | SedeVeterinaria);
                      setCitaSeleccionada(null);
                    }}
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
            </ScrollView>
          </View>

          <CalendarioTurnos
            turnos={porDia.filter(
              (turno) => filtroSede === 'Todas' || turno.sede === filtroSede
            )}
            valorHoy={valorHoy}
            fechaSeleccionada={fechaSeleccionada}
            onSelectFecha={(valor) => {
              setFechaSeleccionada(valor === '' ? null : valor);
              setCitaSeleccionada(null);
            }}
          />
        </View>

        <View style={styles.listas}>
          {seccionLista(tituloLista, turnosDelDia.map(aCita), vacioLista)}
        </View>

        <View style={[styles.agendar, { height: altoAgendar }]}>
          <Pressable
            style={({ pressed }) => [styles.agendarBoton, pressed && estilos.buttonPressed]}
            onPress={() =>
              router.push(
                esAdmin
                ?                   filtroSede === 'Todas'
                  ? { pathname: '/admin-turnos-activos', params: { sede: 'Todas' } }
                  : { pathname: '/admin-turnos-activos', params: { sede: filtroSede } }
                : '/nuevo-turno'
              )
            }
            accessibilityRole="link"
            accessibilityLabel={esAdmin ? 'Atender pacientes' : 'Agendar turno'}
          >
            <View style={styles.agendarIcono}>
              <Ionicons
                name={esAdmin ? 'medkit-outline' : 'calendar-outline'}
                size={22}
                color="#fffefc"
              />
            </View>
            <View style={styles.agendarTexto}>
              <Text style={styles.agendarTitulo}>
                {esAdmin ? 'Atender pacientes' : 'Agendar turno'}
              </Text>
              <Text style={styles.agendarSubtitulo}>
                {esAdmin ? 'Llegadas que esperan ser atendidas' : 'Elegí fecha, hora y mascota'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8aa38c" />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={citaSeleccionada !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setCitaSeleccionada(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setCitaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar detalle"
          />
          {citaSeleccionada && (
            <View style={estilos.modalCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setCitaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar detalle"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>

              <Text style={estilos.modalTitle}>{citaSeleccionada.mascota}</Text>
              <Text style={estilos.modalText}>Motivo: {citaSeleccionada.motivo}</Text>
              <Text style={estilos.modalText}>
                Fecha:{' '}
                {new Date(`${citaSeleccionada.guardado.fecha}T12:00:00`).toLocaleDateString(
                  'es-AR',
                  { weekday: 'long', day: 'numeric', month: 'long' }
                )}
              </Text>
              <Text style={estilos.modalText}>Hora: {citaSeleccionada.hora}</Text>
              {citaSeleccionada.dueno ? (
                <Text style={estilos.modalText}>Dueño: {citaSeleccionada.dueno}</Text>
              ) : null}
              {citaSeleccionada.descripcion ? (
                <Text style={estilos.modalText}>
                  Descripción: {citaSeleccionada.descripcion}
                </Text>
              ) : null}

              {/* Solo para el cliente, y solo si el turno todavia no paso: es el que
                  tiene que llegar a la sede. El veterinario ya esta ahi y no le
                  sirve de nada, y de un turno viejo la direccion no sirve para
                  nada. Igual que en la portada. */}
              {esAdmin || turnoYaPaso ? null : (
                <>
                  <View style={styles.modalSede}>
                    <Text style={estilos.modalText}>
                      <Text style={styles.modalEtiqueta}>Sede: </Text>
                      {citaSeleccionada.guardado.sede}
                    </Text>
                    <Text style={estilos.modalText}>
                      <Text style={styles.modalEtiqueta}>Dirección: </Text>
                      {direccionesSedes[citaSeleccionada.guardado.sede]}
                    </Text>
                  </View>

                  {/* Boton de adorno: todavia no abre nada. Se saco el Linking,
                      que en web no existe y en Android se lleva la app afuera.
                      Cuando se defina a donde lleva, se le pone el onPress. */}
                  <Pressable
                    // Mismo verde y mismo radio que "Escanear QR de llegada": dos
                    // botones distintos al lado en la misma pantalla se ven mal.
                    style={({ pressed }) => [
                      estilos.qrBoton,
                      styles.irBoton,
                      pressed && estilos.buttonPressed,
                    ]}
                    onPress={() => {
                      // Sin accion a proposito.
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Ir a la sede"
                    accessibilityHint="Todavía no está disponible"
                  >
                    <Text style={estilos.buttonTextPrimary}>Ir</Text>
                  </Pressable>
                </>
              )}

              {puedeEditar ? (
                <Pressable
                  style={({ pressed }) => [styles.modificar, pressed && estilos.buttonPressed]}
                  onPress={() => abrirEdicion(citaSeleccionada.guardado)}
                  accessibilityRole="button"
                  accessibilityLabel={`Modificar el turno de ${citaSeleccionada.mascota}`}
                >
                  <Ionicons name="create-outline" size={19} color="#ffffff" />
                  <Text style={styles.modificarTexto}>Modificar turno</Text>
                </Pressable>
              ) : null}

              {puedeCancelar ? (
                <Pressable
                  style={({ pressed }) => [styles.eliminar, pressed && estilos.buttonPressed]}
                  onPress={() => {
                    setMotivoCancelacion('');
                    setErrorCancelar('');
                    setConfirmarCancelacion(true);
                  }}
                  disabled={cancelando}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancelar el turno de ${citaSeleccionada.mascota}`}
                >
                  <View style={styles.eliminarFila}>
                    <Ionicons name="close-circle-outline" size={19} color="#8a5324" />
                    <Text style={styles.eliminarTexto}>Cancelar turno</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </Modal>

      {/* Confirmacion. Sin campo de texto: aca se responde si o no. */}
      <Modal
        visible={confirmarCancelacion}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setConfirmarCancelacion(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setConfirmarCancelacion(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar confirmación"
          />
          <View style={estilos.modalCard} accessibilityRole="alert">
            <Text style={estilos.modalTitle}>¿Cancelar el turno?</Text>
            <Text style={estilos.modalText}>
              Se elimina el turno de {citaSeleccionada?.mascota ?? 'la mascota'} del{' '}
              {citaSeleccionada
                ? `${fechaCorta(citaSeleccionada.guardado.fecha)} a las ${citaSeleccionada.hora} hs`
                : ''}{' '}
              y no se puede deshacer.{' '}
              {esAdmin ? 'Al dueño le llega la cancelación.' : 'La veterinaria se queda sin este turno.'}
            </Text>

            {esAdmin ? (
              <>
                <Text style={styles.motivoLabel}>Motivo de la cancelación</Text>
                <TextInput
                  style={styles.motivoInput}
                  placeholder="Ej. El profesional que iba a atenderla tuvo un imprevisto."
                  placeholderTextColor="#7a8378"
                  value={motivoCancelacion}
                  onChangeText={setMotivoCancelacion}
                  multiline
                  numberOfLines={4}
                  maxLength={400}
                  textAlignVertical="top"
                  accessibilityLabel="Motivo de la cancelación del turno"
                />
                <Text style={styles.motivoAyuda}>
                  Se le manda tal cual lo escribas al dueño, en la notificación.
                </Text>
              </>
            ) : null}

            {errorCancelar ? (
              <Text style={styles.errorCancelar} accessibilityRole="alert">
                {errorCancelar}
              </Text>
            ) : null}

            <View style={[estilos.modalActions, styles.accionesCentradas]}>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  estilos.modalButtonNeutral,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => {
                  setConfirmarCancelacion(false);
                  setMotivoCancelacion('');
                  setErrorCancelar('');
                }}
                accessibilityRole="button"
                accessibilityLabel="No, volver sin cancelar"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>No</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  styles.confirmarCancelacion,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => void cancelarTurno()}
                disabled={cancelando}
                accessibilityRole="button"
                accessibilityState={{ busy: cancelando }}
                accessibilityLabel="Sí, cancelar el turno"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  {cancelando ? 'Cancelando...' : 'Sí, cancelar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modificar el turno. Modal propio y no campos dentro del de detalle:
          son cuatro datos y un calendario de horarios, y metidos en el detalle
          el cartel queda mas alto que la pantalla. */}
      <Modal
        visible={editando}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setEditando(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setEditando(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar edición de turno"
          />
          <View style={estilos.modalCard}>
            <Pressable
              style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
              onPress={() => setEditando(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar edición de turno"
            >
              <Ionicons name="close" size={24} color="#263b32" />
            </Pressable>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={estilos.modalTitle}>Modificar turno</Text>
              {citaSeleccionada ? (
                <Text style={styles.modalNombreMascota}>
                  {citaSeleccionada.guardado.mascota.nombre}
                </Text>
              ) : null}

              <Text style={styles.label}>Tipo de turno</Text>
              <View style={styles.filaOpciones}>
                {TIPOS_TURNO.map((opcion) => {
                  const elegida = tipo === opcion;
                  return (
                    <Pressable
                      key={opcion}
                      onPress={() => setTipo(opcion)}
                      accessibilityRole="radio"
                      accessibilityLabel={opcion}
                      accessibilityState={{ selected: elegida }}
                      style={({ pressed }) => [
                        styles.opcion,
                        elegida && styles.opcionSeleccionada,
                        pressed && estilos.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[styles.opcionTexto, elegida && styles.opcionTextoSeleccionado]}
                      >
                        {opcion}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Sede</Text>
              <View style={styles.filaOpciones}>
                {sedesVeterinaria.map((opcion) => {
                  const elegida = sedeForm === opcion;
                  return (
                    <Pressable
                      key={opcion}
                      onPress={() => {
                        if (opcion === sedeForm) return;
                        setSedeForm(opcion);
                        const [year, month] = fechaForm.split('-').map(Number);
                        if (year && month) void cargarDisponibilidad(year, month, opcion);
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={opcion}
                      accessibilityState={{ selected: elegida }}
                      style={({ pressed }) => [
                        styles.opcion,
                        elegida && styles.opcionSeleccionada,
                        pressed && estilos.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[styles.opcionTexto, elegida && styles.opcionTextoSeleccionado]}
                      >
                        {opcion}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.bloqueCampo}>
                <TurnoDateTimeField
                  sede={sedes.find((item) => item.nombre === sedeForm)}
                  tipo="fecha"
                  horariosOcupados={horariosOcupadosEfectivos}
                  cargandoDisponibilidad={cargandoDisponibilidad}
                  errorDisponibilidad={errorDisponibilidad}
                  valor={fechaForm}
                  onChange={(valor) => {
                    setFechaForm(valor);
                    setHoraForm('');
                  }}
                  onMonthChange={(year, month) => void cargarDisponibilidad(year, month, sedeForm)}
                />
              </View>

              <View style={styles.bloqueCampo}>
                <TurnoDateTimeField
                  sede={sedes.find((item) => item.nombre === sedeForm)}
                  tipo="hora"
                  valor={horaForm}
                  onChange={setHoraForm}
                  fechaSeleccionadaValor={fechaForm}
                  horariosOcupados={horariosOcupadosEfectivos}
                  cargandoDisponibilidad={cargandoDisponibilidad}
                  errorDisponibilidad={errorDisponibilidad}
                />
              </View>

              {errorGuardado ? (
                <Text style={styles.errorGuardado} accessibilityRole="alert">
                  {errorGuardado}
                </Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [styles.confirmar, pressed && estilos.buttonPressed]}
                onPress={() => void guardarCambios()}
                disabled={guardando}
                accessibilityRole="button"
                accessibilityState={{ busy: guardando }}
              >
                <Text style={styles.confirmarTexto}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AvisoExito
        visible={turnoGuardado !== null}
        titulo="¡Turno actualizado!"
        subtitulo={
          turnoGuardado !== null
            ? `Guardamos los cambios del turno de ${turnoGuardado.mascota}: ${turnoGuardado.texto}.`
            : undefined
        }
        etiquetaBoton="Cerrar el aviso de turno actualizado"
        onCerrar={() => setTurnoGuardado(null)}
      />

      <AvisoExito
        visible={turnoCancelado !== null}
        titulo="¡Turno cancelado!"
        subtitulo={
          turnoCancelado !== null
            ? `Se canceló el turno de ${turnoCancelado.mascota} del ${turnoCancelado.texto} y el cliente fue notificado.`
            : undefined
        }
        etiquetaBoton="Cerrar el aviso de turno cancelado"
        onCerrar={() => setTurnoCancelado(null)}
      />
    </AppDrawer>
  );
}

const styles = {
  pantalla: { flex: 1, backgroundColor: '#fffefc' },
  modalNombreMascota: {
    color: '#0f3e17',
    fontSize: 20,
    fontWeight: 'bold' as const,
    marginTop: 2,
  },
  errorGuardado: { color: '#a32828', fontSize: 14, lineHeight: 20, marginTop: 10 },
  label: {
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 12,
    marginBottom: 6,
  },
  filaOpciones: { flexDirection: 'row' as const, gap: 6, marginBottom: 4 },
  opcion: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  opcionSeleccionada: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  opcionTexto: { color: '#1e3326', fontSize: 13, fontWeight: '500' as const },
  opcionTextoSeleccionado: { color: '#0f3e17', fontWeight: 'bold' as const },
  bloqueCampo: { marginTop: 12 },
  confirmar: {
    alignItems: 'center' as const,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  confirmarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' as const },
  modificar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  modificarTexto: { color: '#ffffff', fontSize: 15, fontWeight: '600' as const },
  motivoLabel: {
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 6,
  },
  motivoInput: {
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#f3f7f1',
    fontSize: 15,
    color: '#1e3326',
  },
  motivoAyuda: { marginTop: 6, color: '#69746a', fontSize: 12, lineHeight: 18 },
  eliminar: {
    alignItems: 'center' as const,
    marginTop: 10,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#d3a179',
    borderRadius: 12,
    backgroundColor: '#f7ede6',
  },
  eliminarFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  eliminarTexto: { color: '#8a5324', fontSize: 15, fontWeight: '600' as const },
  confirmarCancelacion: { backgroundColor: '#a32828' },
  errorCancelar: { marginTop: 12, color: '#a32828', fontSize: 13, lineHeight: 19 },
  // La confirmacion es una decision, no una accion de formulario: los botones
  // van al centro de la ventana, parejos y con el mismo peso a los lados. En los
  // formularios siguen a la derecha porque la accion vive abajo del contenido.
  accionesCentradas: { justifyContent: 'center' as const },
  cabecera: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0 },
  bloqueSede: { marginBottom: 12 },
  labelSede: { marginBottom: 8, color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
  filaSedes: { flexDirection: 'row' as const, gap: 8 },
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
  // El padding lateral tiene que ser el mismo que el de la cabecera para que la
  // tarjeta de la lista quede del mismo ancho que el calendario de arriba.
  listas: { flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  lista: {
    flex: 1,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 16,
    backgroundColor: '#f2f9f1',
    overflow: 'hidden' as const,
  },
  listaEncabezado: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 9 },
  listaFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  tituloSeccion: { marginTop: 0, marginBottom: 0, flex: 1 },
  subtituloSeccion: { marginBottom: 0 },
  listaContenido: { paddingHorizontal: 12, paddingBottom: 12 },
  cargandoLista: { paddingVertical: 20 },
  notaVacia: { paddingBottom: 8 },
  turnoFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 64,
  },
  turnoFoto: { width: 56, height: 56, borderRadius: 12 },
  turnoFotoVacia: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#e2f2e4' },
  turnoTexto: { flex: 1 },
dueno: { color: '#0f3e17', fontSize: 14, fontWeight: '600' as const },
sello: {
   borderWidth: 1,
   borderColor: '#0f3e17',
   borderRadius: 10,
   paddingHorizontal: 8,
   paddingVertical: 2,
   backgroundColor: '#e8f3e4',
  },
  selloTexto: { color: '#0f3e17', fontSize: 11, fontWeight: '700' as const },
  turnoEncabezado: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  turnoTitulo: { flexShrink: 1 },
  modalSede: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalEtiqueta: { fontWeight: '700' as const, color: '#0f3e17' },
  irBoton: { marginTop: 20, marginBottom: 0 },
  agendar: {
    paddingHorizontal: 15,
    paddingTop: 6,
    paddingBottom: 12,
  },
  agendarBoton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#b9ddba',
    borderRadius: 16,
    backgroundColor: '#d9f0da',
  },
  agendarIcono: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 20,
    backgroundColor: '#2f7a3f',
  },
  agendarTexto: { flex: 1 },
  agendarTitulo: { color: '#0f3e17', fontSize: 17, fontWeight: 'bold' as const },
  agendarSubtitulo: { marginTop: 2, color: '#6b7d6d', fontSize: 13 },
};
