import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function TurnosScreen() {
  const [turnosGuardados, setTurnosGuardados] = useState<TurnoGuardado[]>([]);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const { bottom } = useSafeAreaInsets();

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

  const listaTurnos: CitaLista[] = [
    ...turnosGuardados
      .filter((turno) => turnoSiguePendiente(turno, new Date()))
      .map((turno) => ({
      id: -turno.id,
      key: `guardado-${turno.id}`,
      mascota: turno.mascota.nombre,
      motivo: turno.tipo,
      fecha: formatearFechaTurno(turno.fecha, turno.hora),
      guardado: turno,
      })),
  ];

  const pie = useMemo(
    () => [estilos.actionFooter, { paddingBottom: bottom + 24 }],
    [bottom]
  );

  return (
    <AppDrawer title="Turnos">
      <View style={estilos.screenWithFooter}>
        <FlatList
          style={estilos.container}
          data={listaTurnos}
          keyExtractor={(item) => item.key}
          contentContainerStyle={estilos.listPadding}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [estilos.cardVertical, pressed && estilos.buttonPressed]}
              onPress={() => setCitaSeleccionada(item)}
              accessibilityRole="button"
              accessibilityLabel={`Ver detalle de ${item.mascota}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {item.guardado.mascota.foto ? (
                  <Image
                    source={{ uri: item.guardado.mascota.foto }}
                    style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#cfe7d3' }}
                    resizeMode="cover"
                    accessibilityLabel={`Foto de ${item.mascota}`}
                  />
                ) : (
                  <View style={styles.turnPhotoPlaceholder}>
                    <Ionicons name="paw-outline" size={26} color="#0f3e17" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={estilos.cardTitle}>
                    {item.mascota} - {item.motivo}
                  </Text>
                  <Text style={estilos.cardSubtitle}>{item.fecha}</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListHeaderComponent={
            cargando || error ? (
              <View style={{ paddingVertical: 12 }}>
                {cargando ? (
                  <ActivityIndicator color="#0f3e17" />
                ) : (
                  <Text style={estilos.cardSubtitle}>{error}</Text>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            !cargando && !error ? (
              <Text style={[estilos.cardSubtitle, { paddingVertical: 16 }]}>
                No tienes próximos turnos.
              </Text>
            ) : null
          }
        />
        <View style={pie}>
          <Link href="/nuevo-turno" asChild>
            <Pressable
              style={estilos.addTurnButton}
              accessibilityRole="link"
              accessibilityLabel="Agregar turno"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>Agregar turno</Text>
            </Pressable>
          </Link>
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
              <Text style={estilos.modalText}>Fecha: {citaSeleccionada.fecha}</Text>
              {citaSeleccionada.guardado && (
                <Text style={estilos.modalText}>Turno registrado en tu cuenta.</Text>
              )}
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  turnPhotoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 10,
    backgroundColor: '#cfe7d3',
  },
};