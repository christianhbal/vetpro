import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import TurnoDateTimeField from '@/components/turno-date-time-field';
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

type HorarioOcupado = { fecha: string; hora: string };

const tiposTurno = ['Control', 'Vacunas', 'Estética'] as const;

function esHorarioOcupado(value: unknown): value is HorarioOcupado {
  if (typeof value !== 'object' || value === null) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.fecha === 'string' && typeof slot.hora === 'string';
}

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
  const [horariosOcupados, setHorariosOcupados] = useState<HorarioOcupado[]>([]);
  const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);
  const [errorDisponibilidad, setErrorDisponibilidad] = useState('');

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

  const cargarDisponibilidad = useCallback(
    async (year: number, month: number, sedeConsultada: SedeVeterinaria) => {
      const mes = `${year}-${String(month).padStart(2, '0')}`;
      setCargandoDisponibilidad(true);
      setErrorDisponibilidad('');
      setHorariosOcupados([]);
      try {
        const sesion = await obtenerUsuarioActual();
        if (!sesion) {
          throw new Error('Inicia sesión para consultar la disponibilidad.');
        }
        const response = await fetch(
          `${API_BASE_URL}/api/turnos/disponibilidad?mes=${encodeURIComponent(mes)}&sede=${encodeURIComponent(sedeConsultada)}`,
          { headers: { Authorization: `Bearer ${sesion.accessToken}` } }
        );
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(mensajeApi(result) ?? 'No se pudo cargar la disponibilidad.');
        }
        if (!Array.isArray(result) || !result.every(esHorarioOcupado)) {
          throw new Error('La API devolvió horarios ocupados inválidos.');
        }
        setHorariosOcupados(result);
      } catch (requestError) {
        setErrorDisponibilidad(
          requestError instanceof TypeError
            ? apiUnreachableMessage(requestError)
            : requestError instanceof Error
              ? requestError.message
              : apiUnreachableMessage(requestError)
        );
      } finally {
        setCargandoDisponibilidad(false);
      }
    },
    []
  );

  const abrirEdicion = (turno: TurnoAdministrado) => {
    setSeleccionado(turno);
    setErrorGuardado('');
    setTipo(turno.tipo);
    setSede(turno.sede);
    setFecha(turno.fecha);
    setHora(turno.hora);
    const [year, month] = turno.fecha.split('-').map(Number);
    if (year && month) void cargarDisponibilidad(year, month, turno.sede);
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
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setSeleccionado(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar edición de turno"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
              <ScrollView showsVerticalScrollIndicator={false}>
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
              <View style={styles.filaOpciones}>
                {tiposTurno.map((opcion) => {
                  const seleccionado = tipo === opcion;
                  return (
                    <Pressable
                      key={opcion}
                      onPress={() => setTipo(opcion)}
                      accessibilityRole="radio"
                      accessibilityLabel={opcion}
                      accessibilityState={{ selected: seleccionado }}
                      style={({ pressed }) => [
                        styles.opcion,
                        seleccionado && styles.opcionSeleccionada,
                        pressed && estilos.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[styles.opcionTexto, seleccionado && styles.opcionTextoSeleccionado]}
                      >
                        {opcion}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Sede</Text>
              <View style={styles.filaOpciones}>
                {sedesVeterinaria.map((opcion) => {
                  const seleccionada = sede === opcion;
                  return (
                    <Pressable
                      key={opcion}
                      onPress={() => {
                        if (opcion === sede) return;
                        setSede(opcion);
                        const [year, month] = fecha.split('-').map(Number);
                        if (year && month) void cargarDisponibilidad(year, month, opcion);
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={opcion}
                      accessibilityState={{ selected: seleccionada }}
                      style={({ pressed }) => [
                        styles.opcion,
                        seleccionada && styles.opcionSeleccionada,
                        pressed && estilos.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[styles.opcionTexto, seleccionada && styles.opcionTextoSeleccionado]}
                      >
                        {opcion}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.bloqueCampo}>
                <TurnoDateTimeField
                  tipo="fecha"
                  valor={fecha}
                  onChange={(valor) => {
                    setFecha(valor);
                    setHora('');
                  }}
                  onMonthChange={(year, month) => void cargarDisponibilidad(year, month, sede)}
                />
              </View>

              <View style={styles.bloqueCampo}>
                <TurnoDateTimeField
                  tipo="hora"
                  valor={hora}
                  onChange={setHora}
                  fechaSeleccionadaValor={fecha}
                  horariosOcupados={horariosOcupados}
                  cargandoDisponibilidad={cargandoDisponibilidad}
                  errorDisponibilidad={errorDisponibilidad}
                />
              </View>
              {errorGuardado ? (
                <Text style={styles.saveError} accessibilityRole="alert">
                  {errorGuardado}
                </Text>
              ) : null}
              <Pressable
                style={({ pressed }) => [
                  styles.confirmar,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => void guardarCambios()}
                disabled={guardando}
                accessibilityRole="button"
                accessibilityState={{ busy: guardando }}
              >
                <Text style={styles.confirmarTexto}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </Text>
              </Pressable>
              </ScrollView>
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
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  filaOpciones: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  opcion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  opcionSeleccionada: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  opcionTexto: { color: '#1e3326', fontSize: 13, fontWeight: '500' },
  opcionTextoSeleccionado: { color: '#0f3e17', fontWeight: 'bold' },
  bloqueCampo: { marginTop: 12 },
  confirmar: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  confirmarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' },
});
