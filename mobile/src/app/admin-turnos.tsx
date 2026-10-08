import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { formatearFechaTurno } from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

type TurnoAdministrado = {
  id: number;
  tipo: string;
  fecha: string;
  hora: string;
  user: { nombre: string; email: string };
  mascota: { nombre: string };
};

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

function esTurnoAdministrado(value: unknown): value is TurnoAdministrado {
  if (typeof value !== 'object' || value === null) return false;
  const turno = value as Record<string, unknown>;
  return (
    typeof turno.id === 'number' &&
    typeof turno.tipo === 'string' &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    typeof turno.user === 'object' &&
    turno.user !== null &&
    typeof turno.mascota === 'object' &&
    turno.mascota !== null
  );
}

export default function AdminTurnosScreen() {
  const router = useRouter();
  const [turnos, setTurnos] = useState<TurnoAdministrado[]>([]);
  const [seleccionado, setSeleccionado] = useState<TurnoAdministrado | null>(null);
  const [tipo, setTipo] = useState('Control');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargarTurnos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const sesion = await obtenerUsuarioActual();
      if (!sesion?.esAdmin) {
        router.replace('/app');
        return;
      }
      setToken(sesion.accessToken);
      const response = await fetch(`${API_BASE_URL}/api/admin/turnos`, {
        headers: { Authorization: `Bearer ${sesion.accessToken}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar los turnos.');
        setTurnos([]);
        return;
      }
      if (!Array.isArray(result)) {
        setError('La API devolvió una lista de turnos inválida.');
        setTurnos([]);
        return;
      }
      setTurnos(result);
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setTurnos([]);
    } finally {
      setCargando(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
    }, [cargarTurnos])
  );

  const abrirEdicion = (turno: TurnoAdministrado) => {
    setSeleccionado(turno);
    setTipo(turno.tipo);
    setFecha(turno.fecha);
    setHora(turno.hora);
  };

  const guardarCambios = async () => {
    if (!seleccionado || guardando) return;
    setGuardando(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/turnos/${seleccionado.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tipo, fecha: fecha.trim(), hora: hora.trim() }),
        }
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        Alert.alert('No se pudo modificar el turno', mensajeApi(result) ?? 'Inténtalo nuevamente.');
        return;
      }
      if (!esTurnoAdministrado(result) || result.id !== seleccionado.id) {
        throw new Error('La API no confirmó los cambios del turno.');
      }
      setTurnos((actuales) =>
        actuales.map((turno) => (turno.id === result.id ? result : turno))
      );
      setSeleccionado(null);
      Alert.alert('Turno actualizado', 'Los cambios se guardaron correctamente en la base de datos.');
    } catch (requestError) {
      Alert.alert('No se pudo modificar el turno', apiUnreachableMessage(requestError));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AppDrawer title="Modificar turnos">
      <FlatList
        style={estilos.container}
        data={turnos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        ListEmptyComponent={
          <View style={{ paddingVertical: 18 }}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>{error || 'No hay turnos registrados.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [estilos.cardVertical, pressed && { opacity: 0.75 }]}
            onPress={() => abrirEdicion(item)}
            accessibilityRole="button"
            accessibilityLabel={`Modificar turno de ${item.mascota.nombre}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.cardTitle}>{item.mascota.nombre} · {item.tipo}</Text>
                <Text style={estilos.cardSubtitle}>{formatearFechaTurno(item.fecha, item.hora)}</Text>
                <Text style={estilos.cardSubtitle}>{item.user.nombre} · {item.user.email}</Text>
              </View>
              <Ionicons name="create-outline" size={22} color="#0f3e17" />
            </View>
          </Pressable>
        )}
      />

      <Modal
        visible={seleccionado !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSeleccionado(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setSeleccionado(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar edición de turno"
          />
          {seleccionado ? (
            <View style={estilos.modalCard}>
              <Text style={estilos.modalTitle}>Modificar turno</Text>
              <Text style={estilos.modalText}>
                {seleccionado.mascota.nombre} · {seleccionado.user.nombre}
              </Text>
              <Text style={styles.label}>Tipo de turno</Text>
              <Picker selectedValue={tipo} onValueChange={(value) => setTipo(value)}>
                <Picker.Item label="Control" value="Control" />
                <Picker.Item label="Vacunas" value="Vacunas" />
                <Picker.Item label="Estética" value="Estética" />
              </Picker>
              <Text style={styles.label}>Fecha (AAAA-MM-DD)</Text>
              <TextInput
                value={fecha}
                onChangeText={setFecha}
                autoCapitalize="none"
                style={styles.input}
                accessibilityLabel="Fecha del turno"
              />
              <Text style={styles.label}>Hora (HH:mm)</Text>
              <TextInput
                value={hora}
                onChangeText={setHora}
                autoCapitalize="none"
                style={styles.input}
                accessibilityLabel="Hora del turno"
              />
              <Pressable
                style={[estilos.addTurnButton, { marginTop: 14 }]}
                onPress={() => void guardarCambios()}
                disabled={guardando}
                accessibilityRole="button"
              >
                <Text style={estilos.buttonTextPrimary}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#263b32',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f1f5ef',
    borderRadius: 8,
    color: '#263b32',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
