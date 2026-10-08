import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  descripcionEspecieMascota,
  formatearFechaTurno,
  turnoSiguePendiente,
  type TurnoGuardado,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  edad: number | null;
  foto: string | null;
};

type CitaLista = {
  id: number;
  key: string;
  mascota: string;
  motivo: string;
  fecha: string;
  guardado: TurnoGuardado;
};

export default function InicioScreen() {
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargandoMascotas, setCargandoMascotas] = useState(true);
  const [errorMascotas, setErrorMascotas] = useState('');
  const [turnosGuardados, setTurnosGuardados] = useState<TurnoGuardado[]>([]);
  const [cargandoTurnos, setCargandoTurnos] = useState(true);
  const [errorTurnos, setErrorTurnos] = useState('');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const fotoModalSize = Math.max(
    0,
    Math.min(windowWidth * 0.82, windowHeight - 200, 640)
  );

  const cargarMascotas = useCallback(async () => {
    setCargandoMascotas(true);
    setMascotas([]);
    setErrorMascotas('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado = await response.json();
      if (!response.ok) {
        setErrorMascotas(resultado.message ?? 'No se pudieron cargar tus mascotas.');
        return;
      }
      setMascotas(resultado);
    } catch (error) {
      setErrorMascotas(apiUnreachableMessage(error));
    } finally {
      setCargandoMascotas(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const cargarTurnos = useCallback(async () => {
    setCargandoTurnos(true);
    setErrorTurnos('');
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
        setErrorTurnos(resultado.message ?? 'No se pudieron cargar tus turnos.');
        setTurnosGuardados([]);
        return;
      }
      setTurnosGuardados(resultado);
    } catch (error) {
      setErrorTurnos(apiUnreachableMessage(error));
      setTurnosGuardados([]);
    } finally {
      setCargandoTurnos(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
    }, [cargarTurnos])
  );

  const ahora = new Date();
  const citasVisibles: CitaLista[] = [
    ...turnosGuardados
      .filter((turno) => turnoSiguePendiente(turno, ahora))
      .map((turno) => ({
      id: -turno.id,
      key: `guardado-${turno.id}`,
      mascota: turno.mascota.nombre,
      motivo: turno.tipo,
      fecha: formatearFechaTurno(turno.fecha, turno.hora),
      guardado: turno,
      })),
  ];

  const renderMascota = ({ item }: { item: Mascota }) => (
    <Pressable
      style={({ pressed }) => [estilos.cardHorizontal, pressed && estilos.buttonPressed]}
      onPress={() => setMascotaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver foto de ${item.nombre}`}
    >
      {item.foto ? (
        <Image
          source={{ uri: item.foto }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            marginBottom: 8,
            backgroundColor: '#cfe7d3',
          }}
          resizeMode="contain"
          accessibilityLabel={`Vista previa de ${item.nombre}`}
        />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            marginBottom: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#cfe7d3',
          }}
        >
          <Ionicons name="paw-outline" size={28} color="#0f3e17" />
        </View>
      )}
      <Text style={estilos.cardTitle}>{item.nombre}</Text>
      <Text style={estilos.cardSubtitle}>
        {descripcionEspecieMascota(item.especie, item.raza)}
      </Text>
    </Pressable>
  );

  const renderCita = ({ item }: { item: CitaLista }) => (
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
            resizeMode="contain"
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
  );

  return (
    <AppDrawer title="VetPro">
      <FlatList
        style={estilos.container}
        data={citasVisibles}
        keyExtractor={(item) => item.key}
        renderItem={renderCita}
        contentContainerStyle={estilos.listPadding}
        ListEmptyComponent={
          !cargandoTurnos && !errorTurnos ? (
            <Text style={[estilos.cardSubtitle, { paddingHorizontal: 8, paddingBottom: 16 }]}>
              No tienes próximas citas.
            </Text>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <Text style={estilos.sectionTitle}>Tus Mascotas</Text>
            <FlatList
              horizontal
              data={mascotas}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderMascota}
              showsHorizontalScrollIndicator={false}
              style={estilos.horizontalList}
              contentContainerStyle={estilos.horizontalListContent}
              ListEmptyComponent={
                <View style={{ paddingVertical: 16, paddingHorizontal: 8 }}>
                  {cargandoMascotas ? (
                    <ActivityIndicator color="#0f3e17" />
                  ) : (
                    <Text style={estilos.cardSubtitle}>
                      {errorMascotas || 'Todavía no tienes mascotas registradas.'}
                    </Text>
                  )}
                </View>
              }
            />
            <Link href="/escanear-qr" asChild>
              <Pressable
                style={estilos.qrBoton}
                accessibilityRole="link"
                accessibilityLabel="Escanear código QR de la veterinaria"
              >
                <View style={estilos.qrBotonFila}>
                  <Ionicons name="qr-code-outline" size={20} color="#fffefc" />
                  <Text style={estilos.buttonTextPrimary}>Escanear QR en la veterinaria</Text>
                </View>
              </Pressable>
            </Link>

            <Text style={estilos.sectionTitle}>Próximas Citas</Text>
            {cargandoTurnos ? (
              <ActivityIndicator color="#0f3e17" style={{ marginBottom: 12 }} />
            ) : errorTurnos ? (
              <Text style={[estilos.cardSubtitle, { marginBottom: 12 }]}>{errorTurnos}</Text>
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={estilos.footerButtons}>
            <Link href="/historial" asChild>
              <Pressable
                style={estilos.primaryButton}
                accessibilityRole="link"
                accessibilityLabel="Ver historial"
              >
                <Text style={estilos.buttonTextPrimary}>Ver Historial</Text>
              </Pressable>
            </Link>
          </View>
        }
      />

      <Modal
        visible={mascotaSeleccionada !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMascotaSeleccionada(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setMascotaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
          />
          {mascotaSeleccionada && (
            <View style={estilos.petPhotoCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setMascotaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar foto"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
              {mascotaSeleccionada.foto ? (
                <Image
                  source={{ uri: mascotaSeleccionada.foto }}
                  style={[estilos.petPhoto, { width: fotoModalSize, height: fotoModalSize }]}
                  resizeMode="contain"
                  accessibilityLabel={`Foto de ${mascotaSeleccionada.nombre}`}
                />
              ) : (
                <Ionicons name="paw-outline" size={88} color="#69806a" />
              )}
              <Text style={estilos.cardTitle}>{mascotaSeleccionada.nombre}</Text>
              <Text style={estilos.cardSubtitle}>
                {[
                  descripcionEspecieMascota(
                    mascotaSeleccionada.especie,
                    mascotaSeleccionada.raza
                  ),
                  mascotaSeleccionada.edad !== null
                    ? `${mascotaSeleccionada.edad} años`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          )}
        </View>
      </Modal>

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