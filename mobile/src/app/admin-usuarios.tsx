import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { obtenerUsuarioActual } from '@/lib/session';

type UsuarioAdministrado = {
  id: number;
  nombre: string;
  email: string;
  role: string;
};

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

export default function AdminUsuariosScreen() {
  const [usuarios, setUsuarios] = useState<UsuarioAdministrado[]>([]);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<UsuarioAdministrado | null>(null);
  const [miId, setMiId] = useState<number | null>(null);
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');

  const cargarUsuarios = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const sesion = await obtenerUsuarioActual();
      if (!sesion?.esAdmin) {
        router.replace('/app');
        return;
      }
      setMiId(sesion.id);
      setToken(sesion.accessToken);
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${sesion.accessToken}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar los usuarios.');
        setUsuarios([]);
        return;
      }
      if (!Array.isArray(result)) {
        setError('La API devolvió una lista de usuarios inválida.');
        setUsuarios([]);
        return;
      }
      setUsuarios(result);
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setUsuarios([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarUsuarios();
    }, [cargarUsuarios])
  );

  const confirmarEliminacion = async () => {
    if (!usuarioAEliminar || eliminando) return;
    setEliminando(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${usuarioAEliminar.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const result: unknown = await response.json();
        Alert.alert('No se pudo eliminar', mensajeApi(result) ?? 'Inténtalo nuevamente.');
        return;
      }
      setUsuarios((actuales) => actuales.filter((item) => item.id !== usuarioAEliminar.id));
      setUsuarioAEliminar(null);
    } catch (requestError) {
      Alert.alert('No se pudo eliminar', apiUnreachableMessage(requestError));
    } finally {
      setEliminando(false);
    }
  };

  return (
    <AppDrawer title="Administrar usuarios">
      <View style={estilos.screenWithFooter}>
        <FlatList
          style={estilos.container}
          data={usuarios}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={estilos.listPadding}
          ListHeaderComponent={
            <Link href="/registro" asChild>
              <Pressable
                style={StyleSheet.flatten([estilos.addTurnButton, styles.addUserButton])}
                accessibilityRole="link"
              >
                <Ionicons name="person-add-outline" size={21} color="#fffefc" />
                <Text style={estilos.buttonTextPrimary}>Crear usuario</Text>
              </Pressable>
            </Link>
          }
          ListEmptyComponent={
            <View style={{ paddingVertical: 18 }}>
              {cargando ? (
                <ActivityIndicator color="#0f3e17" />
              ) : (
                <Text style={estilos.cardSubtitle}>{error || 'No hay usuarios registrados.'}</Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={estilos.cardVertical}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.cardTitle}>{item.nombre}</Text>
                  <Text style={estilos.cardSubtitle}>{item.email}</Text>
                  <Text style={estilos.cardSubtitle}>
                    {item.role === 'ADMIN' ? 'Administrador' : 'Usuario normal'}
                    {item.id === miId ? ' · Tú' : ''}
                  </Text>
                </View>
                {item.id !== miId ? (
                  <Pressable
                    onPress={() => setUsuarioAEliminar(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar a ${item.nombre}`}
                    style={{ padding: 10 }}
                  >
                    <Ionicons name="trash-outline" size={22} color="#a32d2d" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        />
      </View>

      <Modal
        visible={usuarioAEliminar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!eliminando) setUsuarioAEliminar(null);
        }}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => {
              if (!eliminando) setUsuarioAEliminar(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancelar eliminación"
          />
          {usuarioAEliminar ? (
            <View style={estilos.modalCard}>
              <Text style={estilos.modalTitle}>¿Eliminar usuario?</Text>
              <Text style={estilos.modalText}>
                ¿Estás seguro de que quieres eliminar la cuenta de {usuarioAEliminar.nombre}?
                También se eliminarán sus mascotas y turnos.
              </Text>
              <View style={estilos.modalActions}>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonNeutral]}
                  onPress={() => setUsuarioAEliminar(null)}
                  disabled={eliminando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  style={[estilos.modalButton, styles.deleteButton]}
                  onPress={() => void confirmarEliminacion()}
                  disabled={eliminando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                    {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  addUserButton: {
    gap: 24,
    marginBottom: 16,
  },
  deleteButton: {
    backgroundColor: '#a32d2d',
  },
};
