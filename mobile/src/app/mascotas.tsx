import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const { bottom } = useSafeAreaInsets();

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

      if (usuario.esAdmin) {
        router.replace('/app');
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
              onPress={() =>
                router.push({
                  pathname: '/mascota-detalle',
                  params: {
                    id: String(item.id),
                    nombre: item.nombre,
                    especie: item.especie,
                    raza: item.raza ?? '',
                    edad: item.edad === null ? '' : String(item.edad),
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
    </AppDrawer>
  );
}

const styles = {
  fila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    minHeight: 64,
  },
  // Mismo color que estilos.cardVertical: la foto va con contain y no llena el
  // cuadro, asi que con otro color se veia el contraste alrededor de la imagen.
  foto: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#b1dbb8' },
  fotoSinFoto: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#cfe7d3' },
  fotoVacio: { alignItems: 'center' as const, justifyContent: 'center' as const },
  texto: { flex: 1 },
};
