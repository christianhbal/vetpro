import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
  atendidoEn: string | null;
  descripcion: string | null;
  esDemo: boolean;
  user: { nombre: string; email: string };
  mascota: { id: number; nombre: string; especie: string; raza: string | null };
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
    typeof datosMascota.id === 'number' &&
    typeof datosMascota.nombre === 'string' &&
    typeof datosMascota.especie === 'string' &&
    (typeof datosMascota.raza === 'string' || datosMascota.raza === null)
  );
}

export default function AdminTurnosActivosScreen() {
  const router = useRouter();

  // La sede se elige en la pantalla de Turnos y llega por parametro. Acá no
  // se modifica: si el usuario cambia de sede, tiene que volver a Turnos.
  const params = useLocalSearchParams<{ sede?: string }>();
  const sedeSeleccionada = esSedeVeterinaria(params.sede) ? params.sede : 'Recoleta';

  // Esta pantalla se entra desde Turnos o desde la portada, asi que la
  // cabecera muestra la flecha de volver en lugar del menu.
  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/turnos');
  };

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

  // El veterinario elige en que sede esta trabajando y solo ve las llegadas
// de esa sede.
const turnosDeLaSede = turnos.filter((turno) => turno.sede === sedeSeleccionada);

// Marcar ya no es un toggle: lleva a la pantalla donde se escribe lo que
  // paso, y recien ahi se completa el turno.
  const registrarAtencion = (turno: TurnoActivo) => {
    router.push({
      pathname: '/marcar-turno',
      params: {
        id: String(turno.id),
        mascotaId: String(turno.mascota.id),
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
    <AppDrawer
      title="Atender pacientes"
      onVolver={volver}
      etiquetaVolver="Volver a Turnos"
    >
      <FlatList
        style={estilos.container}
        data={turnosDeLaSede}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        onRefresh={() => void cargarTurnos()}
        refreshing={cargando}
        ListHeaderComponent={
          <View>
            <View style={styles.cabecera}>
              <View style={styles.cabeceraIcono}>
                <Ionicons name="location" size={20} color="#0f3e17" />
              </View>
              <View style={styles.cabeceraTexto}>
                <Text style={styles.cabeceraLabel}>Sede</Text>
                <Text style={styles.cabeceraSede} numberOfLines={1}>
                  {sedeSeleccionada}
                </Text>
              </View>
              <View style={styles.contador}>
                <Text style={styles.contadorNumero}>
                  {turnosDeLaSede.length === 1 ? '1' : turnosDeLaSede.length}
                </Text>
                <Text style={styles.contadorLabel}>
                  {turnosDeLaSede.length === 1 ? 'esperando' : 'esperando'}
                </Text>
              </View>
            </View>

            <View style={styles.intro}>
              <Text style={styles.introTexto}>
                Pacientes que escanearon el QR y todavía no fueron atendidos. Tocá{' '}
                <Text style={styles.introResaltado}>Atender</Text> para registrar qué pasó.
              </Text>
              <Text style={styles.introNota}>
                Para cambiar de sede, volvé a la pantalla de Turnos.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.vacio}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : error ? (
              <Text accessibilityRole="alert" style={estilos.cardSubtituloTurno}>
                {error}
              </Text>
            ) : (
              <>
                <View style={styles.vacioIcono}>
                  <Ionicons name="checkmark-done-outline" size={30} color="#5d8a63" />
                </View>
                <Text style={styles.vacioTitulo}>Todo al día</Text>
                <Text style={styles.vacioTexto}>
                  No hay pacientes esperando en {sedeSeleccionada}.
                </Text>
              </>
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
                <Text style={estilos.cardSubtituloTurno} numberOfLines={1}>
                  {item.hora} hs
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.botonAtender,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => registrarAtencion(item)}
                accessibilityRole="button"
                accessibilityLabel={`Registrar la atención del turno de ${item.mascota.nombre}`}
              >
                <Ionicons name="create-outline" size={17} color="#0f3e17" />
                <Text style={styles.botonAtenderTexto}>Atender</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cfdcc9',
    backgroundColor: '#eef5ea',
  },
  cabeceraIcono: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#d9f0da',
  },
  cabeceraTexto: { flex: 1 },
  cabeceraLabel: {
    color: '#6b7d6d',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cabeceraSede: { color: '#0f3e17', fontSize: 18, fontWeight: '700', marginTop: 2 },
  contador: { alignItems: 'center', minWidth: 52 },
  contadorNumero: { color: '#0f3e17', fontSize: 24, fontWeight: 'bold', lineHeight: 28 },
  contadorLabel: { color: '#6b7d6d', fontSize: 11 },
  intro: {
    padding: 13,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: '#f2f9f1',
  },
  introTexto: { color: '#3d5546', fontSize: 13, lineHeight: 19 },
  introResaltado: { color: '#0f3e17', fontWeight: '700' },
  introNota: { marginTop: 6, color: '#7b8c7d', fontSize: 12 },
  vacio: { alignItems: 'center', paddingVertical: 34, paddingHorizontal: 20 },
  vacioIcono: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderRadius: 31,
    backgroundColor: '#eef5ea',
  },
  vacioTitulo: {
    color: '#0f3e17',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  vacioTexto: { color: '#6b7d6d', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
  },
  texto: { flex: 1 },
  dueno: { color: '#0f3e17', fontSize: 14, fontWeight: '600' },
  botonAtender: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#0f3e17',
    borderRadius: 12,
    backgroundColor: '#e8f3e4',
  },
  botonAtenderTexto: {
    color: '#0f3e17',
    fontSize: 14,
    fontWeight: '700',
  },
});
