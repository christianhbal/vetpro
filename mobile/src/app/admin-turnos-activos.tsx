import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  esSedeVeterinaria,
  formatearFechaTurno,
  sedesVeterinaria,
  type SedeVeterinaria,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

type TurnoActivo = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  llegadaEn: string;
  atendidoEn: string | null;
  descripcion: string | null;
  esDemo: boolean;
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
    (typeof turno.atendidoEn === 'string' || turno.atendidoEn === null) &&
    (typeof turno.descripcion === 'string' || turno.descripcion === null) &&
    typeof turno.esDemo === 'boolean' &&
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
  const [sedeSeleccionada, setSedeSeleccionada] = useState<SedeVeterinaria>('Recoleta');

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

  // El veterinario elige en que sede esta trabajando y solo ve las llegadas
// de esa sede.
const opcionesSede: OpcionSelector[] = sedesVeterinaria.map((nombre) => ({
  valor: nombre,
  titulo: nombre,
}));

const sedeSeleccionadaOpcion =
  opcionesSede.find((opcion) => opcion.valor === sedeSeleccionada) ?? null;

const turnosDeLaSede = turnos.filter((turno) => turno.sede === sedeSeleccionada);

// Marcar ya no es un toggle: lleva a la pantalla donde se escribe lo que
  // paso, y recien ahi se completa el turno.
  const registrarAtencion = (turno: TurnoActivo) => {
    router.push({
      pathname: '/marcar-turno',
      params: {
        id: String(turno.id),
        mascota: turno.mascota.nombre,
        tipo: turno.tipo,
        sede: turno.sede,
        fecha: formatearFechaTurno(turno.fecha, turno.hora),
        descripcion: turno.descripcion ?? undefined,
      },
    });
  };

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
        data={turnosDeLaSede}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        onRefresh={() => void cargarTurnos()}
        refreshing={cargando}
        ListHeaderComponent={
          <View>
            <View style={styles.bloqueSede}>
              <SelectorCampo
                label="Sede"
                icono="location-outline"
                placeholder="Elegí una sede"
                opciones={opcionesSede}
                seleccion={sedeSeleccionadaOpcion}
                onSelect={(opcion) => setSedeSeleccionada(opcion.valor as SedeVeterinaria)}
                compacto
                accessibilityLabel="Elegir sede de la veterinaria"
              />
            </View>
            <Text style={[estilos.cardSubtitle, { marginBottom: 12 }]}>
              Llegadas de hoy en {sedeSeleccionada} al escanear el QR. Tocá el botón para registrar
              qué pasó en el turno.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: 18, alignItems: 'center' }}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>
                {error || `Todavía no se registraron llegadas en ${sedeSeleccionada}.`}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={estilos.cardTurno}>
            <View style={styles.fila}>
              <View style={styles.texto}>
                <Text style={estilos.cardTituloTurno} numberOfLines={1} ellipsizeMode="tail">
                  {item.mascota.nombre} · {item.tipo}
                </Text>
                <Text style={styles.dueno} numberOfLines={1} ellipsizeMode="tail">
                  {item.user.nombre}
                </Text>
                <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
                  {formatearFechaTurno(item.fecha, item.hora)} · {item.sede}
                </Text>
                <Text style={estilos.cardSubtituloTurno} numberOfLines={1}>
                  Llegó a las{' '}
                  {new Date(item.llegadaEn).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              <View style={styles.acciones}>
                <Pressable
                  style={({ pressed }) => [
                    styles.botonTilde,
                    pressed && estilos.buttonPressed,
                  ]}
                  onPress={() => registrarAtencion(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Registrar la atención del turno de ${item.mascota.nombre}`}
                >
                  <Ionicons name="checkmark-circle-outline" size={34} color="#2f7a3f" />
                </Pressable>
                <Text style={styles.accionTexto} numberOfLines={1}>
                  Atender
                </Text>
              </View>
            </View>
          </View>
        )}
      />
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  bloqueSede: { marginBottom: 12 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
  },
  texto: { flex: 1 },
  
  dueno: { color: '#0f3e17', fontSize: 14, fontWeight: '600' },
  acciones: { alignItems: 'center', gap: 5 },
  botonTilde: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#b9ddba',
    backgroundColor: '#e8f3e4',
    shadowColor: '#0f3e17',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  botonTildeActivo: {
    backgroundColor: '#2f7a3f',
    borderColor: '#2f7a3f',
    shadowOpacity: 0.22,
  },
  accionTexto: { color: '#556b58', fontSize: 12, fontWeight: '600' },
});
