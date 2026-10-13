import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { CalendarioTurnos } from '@/components/calendario-turnos';
import { estilos } from '@/lib/estilos';
import {
  formatearFechaTurno,
  sedesVeterinaria,
  turnoSiguePendiente,
  type SedeVeterinaria,
  type TurnoGuardado,
} from '@/lib/datos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';

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

function fechaRelativa(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fechaComoValor(fecha);
}

type EjemploPasado = {
  dueno: string;
  mascota: string;
  especie: string;
  raza: string | null;
  tipo: string;
  hora: string;
  descripcion: string | null;
  diasAtras: number;
  sede: SedeVeterinaria;
};

const ejemplosPasados: EjemploPasado[] = [
  {
    dueno: 'Ana Gómez',
    mascota: 'Lola',
    especie: 'Perro',
    raza: 'Golden',
    tipo: 'Vacunas',
    hora: '10:30',
    descripcion: 'Vacunación anual. Quedó tranquila, sin reacción.',
    diasAtras: 3,
    sede: 'Recoleta',
  },
  {
    dueno: 'Bruno Díaz',
    mascota: 'Mora',
    especie: 'Gato',
    raza: null,
    tipo: 'Control',
    hora: '16:00',
    descripcion: 'Control de rutina. Se recomienda continuar con la dieta habitual.',
    diasAtras: 2,
    sede: 'San Isidro',
  },
  {
    dueno: 'Carla Ruiz',
    mascota: 'Tito',
    especie: 'Perro',
    raza: 'Pug',
    tipo: 'Estética',
    hora: '11:30',
    descripcion: 'Baño y corte. Todo listo para la próxima visita.',
    diasAtras: 2,
    sede: 'Recoleta',
  },
];

// Turnos de ejemplo de días anteriores. Solo frontend: no vienen de la API y
// no entran en la lista de próximos, sirven para que el calendario se vea poblado.
function turnosEjemploPasados(): TurnoLista[] {
  return ejemplosPasados.map((ejemplo, indice) => {
    const fecha = fechaRelativa(-ejemplo.diasAtras);
    return {
      id: -2000 - indice,
      tipo: ejemplo.tipo,
      sede: ejemplo.sede,
      fecha,
      hora: ejemplo.hora,
      llegadaEn: new Date(`${fecha}T${ejemplo.hora}:00`).toISOString(),
      atendidoEn: new Date(`${fecha}T${ejemplo.hora}:00`).toISOString(),
      descripcion: ejemplo.descripcion,
      esDemo: true,
      ocultoEnAgenda: false,
      mascotaId: -2000 - indice,
      user: { nombre: ejemplo.dueno },
      mascota: {
        id: -2000 - indice,
        nombre: ejemplo.mascota,
        especie: ejemplo.especie,
        raza: ejemplo.raza,
        foto: null,
      },
    };
  });
}

export default function TurnosScreen() {
  const [turnos, setTurnos] = useState<TurnoLista[]>([]);
  const [ahora, setAhora] = useState(() => new Date());
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [filtroSede, setFiltroSede] = useState<'Todas' | SedeVeterinaria>('Todas');
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

  // Los que solo ocupan la agenda (dias completos) no se listan aca. Tampoco los
  // que ya fueron atendidos. De los que quedan, entran los que la hora aun no
  // venció; los de ejemplo flotan y se ven siempre.
  const proximos = useMemo(
    () =>
      turnos.filter(
        (turno) =>
          !turno.ocultoEnAgenda &&
          (turno.atendidoEn === null || turno.atendidoEn === undefined) &&
          (turno.esDemo === true || turnoSiguePendiente(turno, ahora))
      ),
    [turnos, ahora]
  );

  // Con un dia elegido se ve todo lo agendado para ese dia, aunque la hora ya
  // haya pasado o el turno figure atendido. Los ejemplos de dias anteriores se
  // suman para que el calendario se vea poblado.
  const porDia = useMemo(
    () => [...turnos.filter((turno) => !turno.ocultoEnAgenda), ...turnosEjemploPasados()],
    [turnos]
  );

  const sedesDisponibles = useMemo(() => {
    const conTurnos = new Set(porDia.map((turno) => turno.sede));
    return ['Todas', ...sedesVeterinaria.filter((sede) => conTurnos.has(sede))];
  }, [porDia]);

  const turnosDelDia = useMemo(() => {
    const idsProximos = new Set(proximos.map((turno) => turno.id));
    const origen = fechaSeleccionada === null ? turnos : porDia;

    return origen
      .filter((turno) => filtroSede === 'Todas' || turno.sede === filtroSede)
      .filter((turno) =>
        fechaSeleccionada === null
          ? idsProximos.has(turno.id)
          : turno.fecha === fechaSeleccionada
      )
      .sort((a, b) =>
        a.fecha === b.fecha
          ? a.hora.localeCompare(b.hora)
          : a.fecha.localeCompare(b.fecha)
      );
  }, [fechaSeleccionada, filtroSede, porDia, proximos, turnos]);

  const altoAgendar = Math.max(74, Math.round(windowHeight * 0.1));

  const renderTurno = (cita: CitaLista) => (
    <Pressable
      key={cita.key}
      style={({ pressed }) => [
        estilos.cardTurno,
        cita.atendido && styles.tarjetaAtendida,
        pressed && estilos.buttonPressed,
      ]}
      onPress={() => setCitaSeleccionada(cita)}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${cita.mascota}`}
    >
      <View style={styles.turnoFila}>
        {cita.guardado.mascota.foto ? (
          <Image
            source={{ uri: cita.guardado.mascota.foto }}
            style={styles.turnoFoto}
            resizeMode="cover"
            accessibilityLabel={`Foto de ${cita.mascota}`}
          />
        ) : (
          <View style={styles.turnPhotoPlaceholder}>
            <Ionicons name="paw-outline" size={26} color="#0f3e17" />
          </View>
        )}
        <View style={styles.turnoTexto}>
          <Text style={estilos.cardTituloTurno} numberOfLines={1} ellipsizeMode="tail">
            {cita.mascota} - {cita.motivo}
          </Text>
          {cita.dueno ? (
            <Text style={styles.dueno} numberOfLines={1} ellipsizeMode="tail">
              {cita.dueno}
            </Text>
          ) : null}
          <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
            {fechaCorta(cita.guardado.fecha)} - {cita.hora} hs
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#8aa38c" />
      </View>
    </Pressable>
  );

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
            <View style={styles.filaSedes}>
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
            </View>
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
                esAdmin ? '/admin-turnos-activos' : '/nuevo-turno'
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
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  pantalla: { flex: 1, backgroundColor: '#fffefc' },
  cabecera: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0 },
  bloqueSede: { marginBottom: 12 },
  labelSede: { marginBottom: 8, color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
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
  turnoFoto: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#e2f2e4' },
  turnoTexto: { flex: 1 },
  dueno: { color: '#0f3e17', fontSize: 14, fontWeight: '600' as const },
  turnPhotoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 12,
    backgroundColor: '#e2f2e4',
  },
  tarjetaAtendida: { borderColor: '#0f3e17', borderWidth: 2 },
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