import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { obtenerUsuarioActual } from '@/lib/session';

type Aviso = {
  id: number;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

function esAviso(value: unknown): value is Aviso {
  if (typeof value !== 'object' || value === null) return false;
  const aviso = value as Record<string, unknown>;
  return (
    typeof aviso.id === 'number' &&
    typeof aviso.title === 'string' &&
    typeof aviso.message === 'string' &&
    (typeof aviso.readAt === 'string' || aviso.readAt === null) &&
    typeof aviso.createdAt === 'string'
  );
}

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

export default function NotificacionesScreen() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargarAvisos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      setToken(usuario.accessToken);
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${usuario.accessToken}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar las notificaciones.');
        setAvisos([]);
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('items' in result) ||
        !Array.isArray(result.items) ||
        !result.items.every(esAviso)
      ) {
        setError('La API devolvió notificaciones con un formato inválido.');
        setAvisos([]);
        return;
      }
      setAvisos(result.items);
    } catch (requestError) {
      setError(apiUnreachableMessage(requestError));
      setAvisos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarAvisos();
    }, [cargarAvisos])
  );

  const marcarLeido = async (aviso: Aviso) => {
    if (aviso.readAt) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications/${aviso.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudo marcar la notificación como leída.');
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('readAt' in result) ||
        typeof result.readAt !== 'string'
      ) {
        setError('La API no confirmó que la notificación se marcó como leída.');
        return;
      }
      const readAt = result.readAt;
      setAvisos((actuales) =>
        actuales.map((actual) =>
          actual.id === aviso.id ? { ...actual, readAt } : actual
        )
      );
    } catch (requestError) {
      setError(apiUnreachableMessage(requestError));
    }
  };

  return (
    <AppDrawer title="Notificaciones">
      <FlatList
        style={estilos.container}
        data={avisos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        onRefresh={() => void cargarAvisos()}
        refreshing={cargando}
        ListEmptyComponent={
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>{error || 'Todavía no tienes notificaciones.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              estilos.cardVertical,
              !item.readAt && styles.unread,
              pressed && estilos.buttonPressed,
            ]}
            onPress={() => void marcarLeido(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.readAt ? '' : 'No leída. '}${item.title}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Ionicons
                name={item.readAt ? 'notifications-outline' : 'notifications'}
                size={22}
                color="#0f3e17"
              />
              <View style={{ flex: 1 }}>
                <Text style={estilos.cardTitle}>{item.title}</Text>
                <Text style={estilos.cardSubtitle}>{item.message}</Text>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleString('es-AR')}
                </Text>
              </View>
              {!item.readAt ? <View style={styles.unreadDot} /> : null}
            </View>
          </Pressable>
        )}
      />
    </AppDrawer>
  );
}

const styles = {
  unread: {
    borderColor: '#0f3e17',
    borderWidth: 2,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#0f3e17',
  },
  date: {
    color: '#555d54',
    fontSize: 12,
    marginTop: 8,
  },
};
