import { useCallback, useState } from 'react';
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
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';
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

export default function TurnosScreen() {
  const [turnos, setTurnos] = useState<TurnoLista[]>([]);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [sedeSeleccionada, setSedeSeleccionada] = useState<SedeVeterinaria>('Recoleta');
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

  const ahora = new Date();
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

  // Los turnos de ejemplo flotan: se ven siempre, mas alla de la fecha de hoy,
  // para poder mostrar la app en cualquier momento.
  const esDeHoy = (turno: TurnoLista) => turno.esDemo === true || turno.fecha === valorHoy;

  const deHoyEnSede = turnos.filter(
    (turno) => esDeHoy(turno) && turno.sede === sedeSeleccionada
  );

  const turnosHoy = (
    esAdmin ? deHoyEnSede.filter((t) => !t.atendidoEn) : turnos.filter(esDeHoy)
  ).map(aCita);

  const segundoListado = esAdmin
    ? deHoyEnSede.filter((t) => t.atendidoEn).map(aCita)
    : turnos
        .filter((turno) => turno.fecha > valorHoy && turnoSiguePendiente(turno, ahora))
        .map(aCita);

  const tituloSegundo = esAdmin ? 'Turnos completados' : 'Turnos próximos';

  const opcionesSede: OpcionSelector[] = sedesVeterinaria.map((nombre) => ({
    valor: nombre,
    titulo: nombre,
  }));

  const sedeSeleccionadaOpcion =
    opcionesSede.find((opcion) => opcion.valor === sedeSeleccionada) ?? null;

  // La fila de agendar ocupa ~10% de la pantalla; el resto se reparte en
  // mitades iguales entre las dos listas.
  const altoAgendar = Math.max(74, Math.round(windowHeight * 0.1));

  const renderTurno = (cita: CitaLista) => (
    <Pressable
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
            {cita.atendido ? cita.mascota : `${cita.mascota} - ${cita.motivo}`}
          </Text>
          {cita.dueno ? (
            <Text style={styles.dueno} numberOfLines={1} ellipsizeMode="tail">
              {cita.dueno}
            </Text>
          ) : null}
          <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
            {cita.hora} hs
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#8aa38c" />
      </View>
    </Pressable>
  );

  const encabezadoSeccion = (titulo: string, citas: CitaLista[]) => (
    <View style={styles.listaEncabezado}>
      <Text style={[estilos.sectionTitleTurno, styles.tituloSeccion]}>{titulo}</Text>
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

  const seccionLista = (
    titulo: string,
    citas: CitaLista[],
    vacio: string,
    estiloContenedor?: object
  ) => (
    <View style={[styles.lista, estiloContenedor]}>
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

  return (
    <AppDrawer title="Turnos">
      <View style={styles.pantalla}>
        {esAdmin ? (
          <View style={styles.bloqueSede}>
            <SelectorCampo
              label="Sede"
              icono="location-outline"
              placeholder="Elegí una sede"
              opciones={opcionesSede}
              seleccion={sedeSeleccionadaOpcion}
              onSelect={(opcion) => setSedeSeleccionada(opcion.valor as SedeVeterinaria)}
              compacto
              accessibilityLabel="Elegir sede de la veterinaria"
            />
          </View>
        ) : null}

        <View style={styles.listas}>
          {seccionLista(
            'Turnos de hoy',
            turnosHoy,
            esAdmin
              ? `No hay turnos para hoy en ${sedeSeleccionada}.`
              : 'No tenés turnos para hoy.'
          )}
          {seccionLista(
            tituloSegundo,
            segundoListado,
            esAdmin
              ? `Todavía no hay turnos completados en ${sedeSeleccionada}.`
              : 'No tenés turnos próximos agendados.',
            styles.listaInferior
          )}
        </View>

        <View style={[styles.agendar, { height: altoAgendar }]}>
          <Pressable
            style={({ pressed }) => [styles.agendarBoton, pressed && estilos.buttonPressed]}
            onPress={() => router.push('/nuevo-turno')}
            accessibilityRole="link"
            accessibilityLabel="Agendar turno"
          >
            <View style={styles.agendarIcono}>
              <Ionicons name="calendar-outline" size={22} color="#fffefc" />
            </View>
            <View style={styles.agendarTexto}>
              <Text style={styles.agendarTitulo}>Agendar turno</Text>
              <Text style={styles.agendarSubtitulo}>Elegí fecha, hora y mascota</Text>
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
  bloqueSede: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0 },
  listas: { flex: 1, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 6 },
  lista: {
    flex: 1,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 16,
    backgroundColor: '#f2f9f1',
    overflow: 'hidden' as const,
  },
  listaInferior: { marginBottom: 0 },
  listaEncabezado: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 9 },
  tituloSeccion: { marginTop: 0, marginBottom: 0 },
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