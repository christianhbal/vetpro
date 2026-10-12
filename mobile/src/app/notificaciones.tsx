import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  const [esAdmin, setEsAdmin] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errorForm, setErrorForm] = useState('');

  const cargarAvisos = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) {
      setCargando(true);
      setError('');
    }
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      setToken(usuario.accessToken);
      setEsAdmin(usuario.esAdmin);
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
      if (mostrarCarga) setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarAvisos();
      const intervalo = setInterval(() => {
        void cargarAvisos(false);
      }, 60 * 1000);
      return () => clearInterval(intervalo);
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

  const abrirNuevo = () => {
    setTitulo('');
    setDescripcion('');
    setErrorForm('');
    setModalNuevo(true);
  };

  const pedirConfirmacion = () => {
    if (!titulo.trim() || !descripcion.trim()) {
      setErrorForm('Completá el título y la descripción del aviso.');
      return;
    }
    if (titulo.trim().length < 4) {
      setErrorForm('El título debe tener al menos 4 caracteres.');
      return;
    }
    setErrorForm('');
    setConfirmando(true);
  };

  const enviarAviso = () => {
    setConfirmando(false);
    setModalNuevo(false);
    setTitulo('');
    setDescripcion('');
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
        ListHeaderComponent={
          esAdmin ? (
            <Pressable
              style={({ pressed }) => [styles.nuevoBoton, pressed && estilos.buttonPressed]}
              onPress={abrirNuevo}
              accessibilityRole="button"
              accessibilityLabel="Enviar notificación a todos los clientes"
            >
              <View style={styles.nuevoFila}>
                <Ionicons name="megaphone-outline" size={20} color="#fffefc" />
                <Text style={estilos.buttonTextPrimary}>Enviar notificación global</Text>
              </View>
            </Pressable>
          ) : null
        }
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
                  {new Date(item.createdAt).toLocaleDateString('es-AR')}
                </Text>
              </View>
              {!item.readAt ? <View style={styles.unreadDot} /> : null}
            </View>
          </Pressable>
        )}
      />

      <Modal
        visible={modalNuevo}
        transparent
        animationType="fade"
        onRequestClose={() => setModalNuevo(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setModalNuevo(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
          <View style={estilos.modalCard}>
            <Pressable
              style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
              onPress={() => setModalNuevo(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={24} color="#263b32" />
            </Pressable>

            <Text style={estilos.modalTitle}>Notificación global</Text>
            <Text style={estilos.modalText}>
              El aviso le va a llegar a todos los clientes de la veterinaria.
            </Text>

            <Text style={estilos.formLabel}>Título</Text>
            <TextInput
              style={estilos.formInput}
              placeholder="Ej. Horarios de atención"
              placeholderTextColor="#7a8378"
              value={titulo}
              onChangeText={setTitulo}
              maxLength={60}
              returnKeyType="next"
            />

            <Text style={estilos.formLabel}>Descripción</Text>
            <TextInput
              style={[estilos.formInput, estilos.formInputUltimo]}
              placeholder="Ej. El domingo no atenderemos."
              placeholderTextColor="#7a8378"
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={240}
            />

            {errorForm ? (
              <Text style={styles.createError} accessibilityRole="alert">
                {errorForm}
              </Text>
            ) : null}

            <View style={estilos.modalActions}>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonPrimary, styles.guardarBoton]}
                onPress={pedirConfirmacion}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>Enviar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={confirmando}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmando(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setConfirmando(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancelar envío"
          />
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitle}>¿Enviar a todos?</Text>
            <Text style={styles.vistaPrevia}>{titulo.trim()}</Text>
            <Text style={estilos.modalText}>{descripcion.trim()}</Text>
            <View style={estilos.modalActions}>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonNeutral]}
                onPress={() => setConfirmando(false)}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonPrimary]}
                onPress={enviarAviso}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  Confirmar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  nuevoBoton: {
    marginBottom: 14,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center' as const,
    backgroundColor: '#0f3e17',
  },
  nuevoFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  guardarBoton: {
    flex: 1,
  },
  createError: {
    color: '#a32828',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  vistaPrevia: {
    color: '#0f3e17',
    fontSize: 17,
    fontWeight: 'bold' as const,
    marginBottom: 8,
  },
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
