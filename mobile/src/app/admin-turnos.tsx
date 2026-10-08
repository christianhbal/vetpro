import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  descripcionEspecieMascota,
  esSedeVeterinaria,
  formatearFechaTurno,
  sedesVeterinaria,
  turnoSiguePendiente,
  type SedeVeterinaria,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

type TurnoAdministrado = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  user: { nombre: string; email: string };
  mascota: { nombre: string; especie: string; raza: string | null };
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
  const mascota = turno.mascota;
  if (typeof mascota !== 'object' || mascota === null) return false;
  const datosMascota = mascota as Record<string, unknown>;
  return (
    typeof turno.id === 'number' &&
    typeof turno.tipo === 'string' &&
    esSedeVeterinaria(turno.sede) &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    typeof turno.user === 'object' &&
    turno.user !== null &&
    typeof datosMascota.nombre === 'string' &&
    typeof datosMascota.especie === 'string' &&
    (typeof datosMascota.raza === 'string' || datosMascota.raza === null)
  );
}

export default function AdminTurnosScreen() {
  const router = useRouter();
  const [turnos, setTurnos] = useState<TurnoAdministrado[]>([]);
  const [seleccionado, setSeleccionado] = useState<TurnoAdministrado | null>(null);
  const [tipo, setTipo] = useState('Control');
  const [sede, setSede] = useState<SedeVeterinaria>('Recoleta');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorGuardado, setErrorGuardado] = useState('');
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

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
    setErrorGuardado('');
    setTipo(turno.tipo);
    setSede(turno.sede);
    setFecha(turno.fecha);
    setHora(turno.hora);
  };

  const turnosProximos = turnos.filter((turno) => turnoSiguePendiente(turno, new Date()));

  const guardarCambios = async () => {
    if (!seleccionado || guardando) return;
    setErrorGuardado('');
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
          body: JSON.stringify({ tipo, sede, fecha: fecha.trim(), hora: hora.trim() }),
        }
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        setErrorGuardado(mensajeApi(result) ?? 'No se pudo modificar el turno.');
        return;
      }
      if (!esTurnoAdministrado(result) || result.id !== seleccionado.id) {
        throw new Error('La API no confirmó los cambios del turno.');
      }
      if (result.sede !== sede || result.fecha !== fecha.trim() || result.hora !== hora.trim()) {
        throw new Error('La API no guardó la sede, fecha y hora solicitadas.');
      }

      const listaResponse = await fetch(`${API_BASE_URL}/api/admin/turnos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listaActualizada: unknown = await listaResponse.json();
      if (
        !listaResponse.ok ||
        !Array.isArray(listaActualizada) ||
        !listaActualizada.every(esTurnoAdministrado)
      ) {
        throw new Error(mensajeApi(listaActualizada) ?? 'No se pudo confirmar el turno actualizado.');
      }
      const turnoActualizado = listaActualizada.find(
        (turno) => turno.id === seleccionado.id
      );
      if (
        !turnoActualizado ||
        turnoActualizado.sede !== sede ||
        turnoActualizado.fecha !== fecha.trim() ||
        turnoActualizado.hora !== hora.trim()
      ) {
        throw new Error('El turno no aparece actualizado al volver a consultar la lista.');
      }

      setTurnos(listaActualizada);
      setSeleccionado(null);
      setMostrarConfirmacion(true);
    } catch (requestError) {
      setErrorGuardado(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : requestError instanceof Error
            ? requestError.message
            : apiUnreachableMessage(requestError)
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AppDrawer title="Modificar turnos">
      <FlatList
        style={estilos.container}
        data={turnosProximos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        ListEmptyComponent={
          <View style={{ paddingVertical: 18 }}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>
                {error ||
                  (turnos.length > 0
                    ? 'No hay turnos próximos para modificar.'
                    : 'No hay turnos registrados.')}
              </Text>
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
                <Text style={estilos.cardTitle}>{item.mascota.nombre}</Text>
                <Text style={estilos.cardSubtitle}>{formatearFechaTurno(item.fecha, item.hora)}</Text>
                <Text style={styles.ownerName}>{item.user.nombre}</Text>
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
              <Text style={estilos.modalTitle}>{seleccionado.mascota.nombre}</Text>
              <Text style={estilos.modalText}>
                Tipo de mascota:{' '}
                {descripcionEspecieMascota(
                  seleccionado.mascota.especie,
                  seleccionado.mascota.raza
                )}
              </Text>
              <Text style={styles.ownerName}>{seleccionado.user.nombre}</Text>
              <Text style={estilos.modalText}>{seleccionado.user.email}</Text>
              <Text style={styles.label}>Tipo de turno</Text>
              <Picker selectedValue={tipo} onValueChange={(value) => setTipo(value)}>
                <Picker.Item label="Control" value="Control" />
                <Picker.Item label="Vacunas" value="Vacunas" />
                <Picker.Item label="Estética" value="Estética" />
              </Picker>
              <Text style={styles.label}>Sede</Text>
              <Picker
                selectedValue={sede}
                onValueChange={(value) => {
                  if (esSedeVeterinaria(value)) setSede(value);
                }}
                accessibilityLabel="Sede del turno"
              >
                {sedesVeterinaria.map((opcion) => (
                  <Picker.Item key={opcion} label={opcion} value={opcion} />
                ))}
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
              {errorGuardado ? (
                <Text style={styles.saveError} accessibilityRole="alert">
                  {errorGuardado}
                </Text>
              ) : null}
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

      <Modal
        visible={mostrarConfirmacion}
        transparent
        animationType="fade"
        onRequestClose={() => setMostrarConfirmacion(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setMostrarConfirmacion(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar mensaje"
          />
          <View style={estilos.modalCard} accessibilityRole="alert">
            <Text style={estilos.modalTitle}>Turno modificado con éxito</Text>
            <View style={estilos.modalActions}>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonPrimary]}
                onPress={() => setMostrarConfirmacion(false)}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  Aceptar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  ownerName: {
    color: '#0f3e17',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  saveError: {
    color: '#a32828',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
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
