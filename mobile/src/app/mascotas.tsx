import { useCallback, useMemo, useState } from 'react';
import { StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { descripcionEspecieMascota, edadDesdeNacimiento } from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { useSesion } from '@/lib/sesion-context';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;

  sexo: string | null;
  fechaNacimiento: string;
  foto: string | null;
};

export default function MascotasScreen() {
  const { usuario: usuarioSesion } = useSesion();
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mostrarLimite, setMostrarLimite] = useState(false);
  const { bottom } = useSafeAreaInsets();

  const margenSeguro = useMemo(
    () => StyleSheet.create({ pie: { paddingBottom: bottom + 24 } }),
    [bottom]
  );
  const pie = [estilos.actionFooter, margenSeguro.pie];

  const cargarMascotas = useCallback(async () => {
    setCargando(true);
    setMascotas([]);
    setError('');
    try {
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }

      if (usuario.esAdmin) {
        router.replace('/app');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`,
          { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
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
  }, [usuarioSesion]);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const descripcionMascota = (mascota: Mascota) =>
    [
      descripcionEspecieMascota(mascota.especie, mascota.raza),
      edadDesdeNacimiento(mascota.fechaNacimiento) !== null ? `${edadDesdeNacimiento(mascota.fechaNacimiento)} años` : null,
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
            <View style={styles.listaVacia}>
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
              onPress={() =>
                router.push({
                  pathname: '/mascota-detalle',
                  params: {
                    id: String(item.id),
                    nombre: item.nombre,
                    especie: item.especie,
                    raza: item.raza ?? '',
                    sexo: item.sexo ?? '',
                    fechaNacimiento: item.fechaNacimiento,
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Ver historial de ${item.nombre}`}
            >
              <View style={styles.fila}>
                {item.foto ? (
                  <Image
                    source={{ uri: item.foto }}
                    style={styles.foto}
                    resizeMode="contain"
                    accessibilityLabel={`Foto de ${item.nombre}`}
                  />
                ) : (
                  <View style={[styles.foto, styles.fotoSinFoto, styles.fotoVacio]}>
                    <Ionicons name="paw-outline" size={28} color="#69806a" />
                  </View>
                )}
                <View style={styles.texto}>
                  <Text style={estilos.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                    {item.nombre}
                  </Text>
                  <Text style={estilos.cardSubtitle} numberOfLines={1} ellipsizeMode="tail">
                    {descripcionMascota(item)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#263b32" />
              </View>
            </Pressable>
          )}
        />
        <View style={pie}>
            <Pressable
              style={estilos.addPetButton}
              onPress={() => {
                if (mascotas.length >= 5) setMostrarLimite(true);
                else router.push('/nueva-mascota');
              }}
              disabled={cargando || Boolean(error)}
              accessibilityRole="button"
              accessibilityLabel="Agregar mascota"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>Agregar mascota</Text>
            </Pressable>
        </View>
      </View>
      <Modal visible={mostrarLimite} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMostrarLimite(false)}>
        <View style={estilos.petModalRoot}>
          <Pressable style={estilos.petModalBackdrop} onPress={() => setMostrarLimite(false)} accessibilityRole="button" accessibilityLabel="Cerrar aviso" />
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitle}>Límite de mascotas</Text>
            <Text style={estilos.modalText}>Tu plan permite un máximo de 5 mascotas.</Text>
            <View style={estilos.modalActions}>
              <Pressable style={({ pressed }) => [estilos.modalButton, estilos.modalButtonPrimary, pressed && estilos.buttonPressed]} onPress={() => setMostrarLimite(false)} accessibilityRole="button">
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>Entendido</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
  },

  foto: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#b1dbb8' },
  fotoSinFoto: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#cfe7d3' },
  fotoVacio: { alignItems: 'center', justifyContent: 'center' },
  texto: { flex: 1 },
  listaVacia: { alignItems: 'center', padding: 24 },
});
