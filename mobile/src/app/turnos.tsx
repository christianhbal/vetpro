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
import { estilos } from '@/lib/estilos';
import {
  formatearFechaTurno,
  turnoSiguePendiente,
  type TurnoGuardado,
} from '@/lib/datos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';

type CitaLista = {
  id: number;
  key: string;
  mascota: string;
  motivo: string;
  fecha: string;
  guardado: TurnoGuardado;
};

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function TurnosScreen() {
  const [turnosGuardados, setTurnosGuardados] = useState<TurnoGuardado[]>([]);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
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
      const response = await fetch(
        `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado = await response.json();
      if (!response.ok) {
        setError(resultado.message ?? 'No se pudieron cargar los turnos guardados.');
        setTurnosGuardados([]);
        return;
      }
      setTurnosGuardados(resultado);
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setTurnosGuardados([]);
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

  const aCita = (turno: TurnoGuardado): CitaLista => ({
    id: -turno.id,
    key: `guardado-${turno.id}`,
    mascota: turno.mascota.nombre,
    motivo: turno.tipo,
    fecha: formatearFechaTurno(turno.fecha, turno.hora),
    guardado: turno,
  });

  // Los turnos de hoy se listan aunque su horario ya haya pasado, para que
  // el dia no quede vacio despues de la consulta.
  const turnosHoy = turnosGuardados
    .filter((turno) => turno.fecha === valorHoy)
    .map(aCita);

  const turnosProximos = turnosGuardados
    .filter((turno) => turno.fecha > valorHoy && turnoSiguePendiente(turno, ahora))
    .map(aCita);

  // La fila de agendar ocupa ~10% de la pantalla; el resto se reparte en
  // mitades iguales entre las dos listas.
  const altoAgendar = Math.max(74, Math.round(windowHeight * 0.1));

  const renderTurno = (cita: CitaLista) => (
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
          <View style={styles.turnPhotoPlaceholder}>
            <Ionicons name="paw-outline" size={26} color="#0f3e17" />
          </View>
        )}
        <View style={styles.turnoTexto}>
          <Text style={estilos.cardTituloTurno}>
            {cita.mascota} - {cita.motivo}
          </Text>
          <Text style={estilos.cardSubtituloTurno}>{cita.fecha}</Text>
          <Text style={estilos.cardSubtituloTurno}>Sede: {cita.guardado.sede}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#8aa38c" />
      </View>
    </Pressable>
  );

  // El encabezado va fuera del ScrollView para que quede fijo; solo las
  // tarjetas scrollean.
  const encabezadoSeccion = (titulo: string, citas: CitaLista[]) => (
    <View style={styles.listaEncabezado}>
      <Text style={[estilos.sectionTitleTurno, styles.tituloSeccion]}>{titulo}</Text>
      <Text style={[estilos.sectionSubtitleTurno, styles.subtituloSeccion]}>
        {citas.length === 1 ? '1 turno' : `${citas.length} turnos`}
      </Text>
    </View>
  );

  const cuerpoLista = (
    citas: CitaLista[],
    vacio: string,
    cargandoLista: boolean,
    errorLista: string
  ) => {
    if (cargandoLista) {
      return <ActivityIndicator color="#2f7a3f" style={styles.cargandoLista} />;
    }
    if (errorLista) {
      return <Text style={[estilos.cardSubtituloTurno, styles.notaVacia]}>{errorLista}</Text>;
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
        {cuerpoLista(citas, vacio, cargando, error)}
      </ScrollView>
    </View>
  );

  return (
    <AppDrawer title="Turnos">
      <View style={styles.pantalla}>
        <View style={styles.listas}>
          {seccionLista('Turnos de hoy', turnosHoy, 'No tenés turnos para hoy.')}
          {seccionLista(
            'Turnos próximos',
            turnosProximos,
            'No tenés turnos próximos agendados.',
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
              <Text style={estilos.modalText}>Sede: {citaSeleccionada.guardado.sede}</Text>
              <Text style={estilos.modalText}>Fecha: {citaSeleccionada.fecha}</Text>
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  pantalla: { flex: 1, backgroundColor: '#fffefc' },
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
  agendarTitulo: {
    color: '#0f3e17',
    fontSize: 17,
    fontWeight: 'bold' as const,
  },
  agendarSubtitulo: { marginTop: 2, color: '#6b7d6d', fontSize: 13 },
  listas: { flex: 1, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 6 },
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
  listaEncabezado: {
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 9,
  },
  tituloSeccion: { marginTop: 0, marginBottom: 0 },
  subtituloSeccion: { marginBottom: 0 },
  listaContenido: { paddingHorizontal: 12, paddingBottom: 12 },
  cargandoLista: { paddingVertical: 20 },
  notaVacia: { paddingBottom: 8 },
  turnoFila: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  turnoFoto: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#e2f2e4' },
  turnoTexto: { flex: 1 },
  turnPhotoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 10,
    backgroundColor: '#e2f2e4',
  },
};