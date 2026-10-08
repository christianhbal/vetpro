import { useCallback, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { descripcionEspecieMascota } from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { obtenerUsuarioActual } from '@/lib/session';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  edad: number | null;
  foto: string | null;
};

export default function MascotasScreen() {
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const { bottom } = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const fotoModalSize = Math.max(
    0,
    Math.min(windowWidth * 0.82, windowHeight - 200, 640)
  );

  const pie = useMemo(
    () => [estilos.actionFooter, { paddingBottom: bottom + 24 }],
    [bottom]
  );

  const cargarMascotas = useCallback(async () => {
    setCargando(true);
    setMascotas([]);
    setError('');
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
        setError(resultado.message ?? 'No se pudieron cargar tus mascotas.');
        return;
      }
      setMascotas(resultado);
    } catch (requestError) {
      setError(apiUnreachableMessage(requestError));
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const descripcionMascota = (mascota: Mascota) =>
    [
      descripcionEspecieMascota(mascota.especie, mascota.raza),
      mascota.edad !== null ? `${mascota.edad} años` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <AppDrawer title="Mascotas">
      <View style={estilos.screenWithFooter}>
        <FlatList
          style={estilos.container}
          data={mascotas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={estilos.listPadding}
          onRefresh={() => void cargarMascotas()}
          refreshing={cargando}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 24 }}>
              {cargando ? (
                <ActivityIndicator color="#0f3e17" />
              ) : (
                <>
                  <Ionicons name="paw-outline" size={42} color="#69806a" />
                  <Text style={estilos.cardSubtitle}>
                    {error || 'Todavía no tienes mascotas registradas.'}
                  </Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [estilos.cardVertical, pressed && estilos.buttonPressed]}
              onPress={() => setMascotaSeleccionada(item)}
              accessibilityRole="button"
              accessibilityLabel={`Ver foto de ${item.nombre}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {item.foto ? (
                  <Image
                    source={{ uri: item.foto }}
                    style={{ width: 64, height: 64, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons name="paw-outline" size={40} color="#69806a" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={estilos.cardTitle}>{item.nombre}</Text>
                  <Text style={estilos.cardSubtitle}>{descripcionMascota(item)}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
        <View style={pie}>
          <Link href="/nueva-mascota" asChild>
            <Pressable
              style={estilos.addPetButton}
              accessibilityRole="link"
              accessibilityLabel="Agregar mascota"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>Agregar mascota</Text>
            </Pressable>
          </Link>
        </View>
      </View>

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
              <Text style={estilos.cardSubtitle}>{descripcionMascota(mascotaSeleccionada)}</Text>
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}
