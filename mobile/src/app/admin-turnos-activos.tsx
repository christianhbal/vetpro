import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { esSedeVeterinaria, formatearFechaTurno, type SedeVeterinaria } from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

type TurnoActivo = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  llegadaEn: string;
  user: { nombre: string; email: string };
  mascota: { nombre: string; especie: string; raza: string | null };
};

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

function esTurnoActivo(value: unknown): value is TurnoActivo {
  if (typeof value !== 'object' || value === null) return false;
  const turno = value as Record<string, unknown>;
  const user = turno.user;
  const mascota = turno.mascota;
  if (typeof user !== 'object' || user === null || typeof mascota !== 'object' || mascota === null) {
    return false;
  }
  const datosUsuario = user as Record<string, unknown>;
  const datosMascota = mascota as Record<string, unknown>;
  return (
    typeof turno.id === 'number' &&
    typeof turno.tipo === 'string' &&
    esSedeVeterinaria(turno.sede) &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    typeof turno.llegadaEn === 'string' &&
    typeof datosUsuario.nombre === 'string' &&
    typeof datosUsuario.email === 'string' &&
    typeof datosMascota.nombre === 'string' &&
    typeof datosMascota.especie === 'string' &&
    (typeof datosMascota.raza === 'string' || datosMascota.raza === null)
  );
}

export default function AdminTurnosActivosScreen() {
  const router = useRouter();
  const [turnos, setTurnos] = useState<TurnoActivo[]>([]);
  const [cargando, setCargando] = useState(true);
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
      const response = await fetch(`${API_BASE_URL}/api/admin/turnos-activos`, {
        headers: { Authorization: `Bearer ${sesion.accessToken}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar los turnos activos.');
        setTurnos([]);
        return;
      }
      if (!Array.isArray(result) || !result.every(esTurnoActivo)) {
        throw new Error('La API devolvió una lista de turnos activos inválida.');
      }
      setTurnos(result);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error && !(fetchError instanceof TypeError)
          ? fetchError.message
          : apiUnreachableMessage(fetchError)
      );
      setTurnos([]);
    } finally {
      setCargando(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
      const intervalo = setInterval(() => void cargarTurnos(), 15_000);
      return () => clearInterval(intervalo);
    }, [cargarTurnos])
  );

  return (
    <AppDrawer title="Turnos activos">
      <FlatList
        style={estilos.container}
        data={turnos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        onRefresh={() => void cargarTurnos()}
        refreshing={cargando}
        ListHeaderComponent={
          <Text style={[estilos.cardSubtitle, { marginBottom: 12 }]}>
            Llegadas registradas hoy al escanear el código QR.
          </Text>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: 18, alignItems: 'center' }}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>
                {error || 'Todavía no se registraron llegadas.'}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={estilos.cardVertical}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons name="checkmark-circle" size={28} color="#0f3e17" />
              <View style={{ flex: 1 }}>
                <Text style={estilos.cardTitle}>
                  {item.mascota.nombre} · {item.tipo}
                </Text>
                <Text style={estilos.cardSubtitle}>{item.user.nombre}</Text>
                <Text style={estilos.cardSubtitle}>
                  {formatearFechaTurno(item.fecha, item.hora)} · {item.sede}
                </Text>
                <Text style={estilos.cardSubtitle}>
                  Llegó a las{' '}
                  {new Date(item.llegadaEn).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          </View>
        )}
      />
    </AppDrawer>
  );
}
