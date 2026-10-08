import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { esSedeVeterinaria, formatearFechaTurno, type TurnoGuardado } from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

function esTurnoGuardado(value: unknown): value is TurnoGuardado {
  if (typeof value !== 'object' || value === null || !('mascota' in value)) return false;
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
    typeof turno.mascotaId === 'number' &&
    typeof datosMascota.id === 'number' &&
    typeof datosMascota.nombre === 'string' &&
    typeof datosMascota.especie === 'string' &&
    (typeof datosMascota.raza === 'string' || datosMascota.raza === null)
  );
}

function turnoYaPaso(turno: TurnoGuardado, ahora: Date): boolean {
  const [year, month, day] = turno.fecha.split('-').map(Number);
  const [hour, minute] = turno.hora.split(':').map(Number);
  const fechaHora = new Date(year, month - 1, day, hour, minute);

  return (
    Number.isFinite(fechaHora.getTime()) &&
    fechaHora.getFullYear() === year &&
    fechaHora.getMonth() === month - 1 &&
    fechaHora.getDate() === day &&
    fechaHora.getHours() === hour &&
    fechaHora.getMinutes() === minute &&
    fechaHora.getTime() < ahora.getTime()
  );
}

export default function Historial() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const [turnos, setTurnos] = useState<TurnoGuardado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const contenedor = useMemo(() => [estilos.formContent, { paddingTop: top }], [top]);

  const cargarHistorial = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado: unknown = await response.json();
      if (!response.ok) {
        const mensaje =
          typeof resultado === 'object' &&
          resultado !== null &&
          'message' in resultado &&
          typeof resultado.message === 'string'
            ? resultado.message
            : 'No se pudo cargar tu historial.';
        setError(mensaje);
        setTurnos([]);
        return;
      }
      if (!Array.isArray(resultado) || !resultado.every(esTurnoGuardado)) {
        setError('La respuesta del servidor no tiene el formato esperado.');
        setTurnos([]);
        return;
      }
      setTurnos(resultado);
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setTurnos([]);
    } finally {
      setCargando(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void cargarHistorial();
    }, [cargarHistorial])
  );

  const turnosPasados = turnos
    .filter((turno) => turnoYaPaso(turno, new Date()))
    .sort((a, b) => `${b.fecha}T${b.hora}`.localeCompare(`${a.fecha}T${a.hora}`));

  const renderTurno = ({ item }: { item: TurnoGuardado }) => (
    <View style={estilos.historialCard}>
      <View style={estilos.historialRow}>
        <Text style={estilos.cardTitle}>{item.mascota.nombre}</Text>
        <Text style={estilos.historialFecha}>
          {formatearFechaTurno(item.fecha, item.hora)}
        </Text>
      </View>
      <Text style={estilos.cardSubtitle}>{item.tipo}</Text>
      <Text style={estilos.cardSubtitle}>Sede: {item.sede}</Text>
    </View>
  );

  return (
    <View style={estilos.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={turnosPasados}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={contenedor}
        renderItem={renderTurno}
        ListHeaderComponent={
          <View>
            <Pressable
              style={({ pressed }) => [estilos.backButton, pressed && estilos.buttonPressed]}
              onPress={() => router.replace('/app')}
              accessibilityRole="button"
              accessibilityLabel="Volver al inicio"
            >
              <Ionicons name="arrow-back" size={20} color="#0f3e17" />
              <Text style={estilos.backText}>VetPro</Text>
            </Pressable>

            <View style={estilos.formWrapper}>
              <Text style={estilos.formTitle}>Historial</Text>
              <Text style={estilos.formSubtitle}>Turnos que ya pasaron.</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={estilos.formWrapper}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : error ? (
              <Text accessibilityRole="alert" style={estilos.modalText}>{error}</Text>
            ) : (
              <Text style={estilos.modalText}>Todavía no tienes turnos anteriores.</Text>
            )}
          </View>
        }
      />
    </View>
  );
}