import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { AvailabilityCalendar, type AgendaHandle } from '@/components/availability-calendar';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';
import { esSedeVeterinaria } from '@/lib/datos';

const MAX_DESCRIPCION = 500;

// Reparto aproximado del alto de esta pantalla. Todo entra sin scrollear, asi
// que la parte variable es la agenda de seguimiento y el resto se mide fijo.
// ALTO_ENCABEZADO es la barra del drawer (safe area + boton de volver).
const ALTO_ENCABEZADO = 64;
const PARTE_FIJA = 300;
const ALTO_AGENDA = 415;

export default function MarcarTurnoScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    mascotaId?: string;
    mascota?: string;
    tipo?: string;
    sede?: string;
    fecha?: string;
    hora?: string;
    descripcion?: string;
  }>();

  const [descripcion, setDescripcion] = useState(params.descripcion ?? '');
  const [agendarSeguimiento, setAgendarSeguimiento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const agenda = useRef<AgendaHandle>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // La agenda de seguimiento va debajo de la descripcion y del Si/No, asi que
  // se comprime con lo que sobra de la pantalla para que todo entre entero.
  const disponible =
    windowHeight - insets.top - insets.bottom - ALTO_ENCABEZADO - PARTE_FIJA;
  const escalaSeguimiento = Math.max(0.68, Math.min(1, disponible / ALTO_AGENDA));

  const turnoId = Number(params.id);
  const mascotaId = Number(params.mascotaId);
  const yaAtendido = Boolean(params.descripcion);

  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/admin-turnos-activos');
  };

  const guardar = async () => {
    if (guardando) return;
    setError('');

    if (!Number.isInteger(turnoId) || turnoId <= 0) {
      setError('No se pudo identificar el turno.');
      return;
    }
    if (!descripcion.trim()) {
      setError('Escribí una descripción de lo que pasó en el turno.');
      return;
    }
    // Si pidio seguimiento, la fecha y la hora tienen que estar elegidas antes
    // de completar el turno: si no, la agenda muestra su propio aviso.
    if (agendarSeguimiento && agenda.current && !agenda.current.listo) {
      setError('Elegí el tipo, la fecha y la hora del turno de seguimiento.');
      return;
    }

    setGuardando(true);
    try {
      const sesion = await obtenerUsuarioActual();
      if (!sesion?.esAdmin) {
        router.replace('/app');
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/api/admin/turnos/${turnoId}/atendido`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sesion.accessToken}`,
          },
          body: JSON.stringify({ descripcion: descripcion.trim() }),
        }
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const mensaje =
          typeof result === 'object' &&
          result !== null &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'No se pudo guardar la atención del turno.';
        setError(mensaje);
        return;
      }

      // La agenda no tiene boton propio: se guarda con este mismo boton. Primero se
      // cierra la atencion y recien despues se saca el turno de seguimiento.
      if (agendarSeguimiento && agenda.current) {
        const guardado = await agenda.current.guardar();
        if (!guardado) return;
      }
      router.replace('/admin-turnos-activos');
    } catch (requestError) {
      setError(
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

  const desmarcar = async () => {
    if (guardando) return;
    setError('');

    if (!Number.isInteger(turnoId) || turnoId <= 0) {
      setError('No se pudo identificar el turno.');
      return;
    }

    setGuardando(true);
    try {
      const sesion = await obtenerUsuarioActual();
      if (!sesion?.esAdmin) {
        router.replace('/app');
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/api/admin/turnos/${turnoId}/atendido`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sesion.accessToken}`,
          },
          body: JSON.stringify({ desmarcar: true }),
        }
      );
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        setError(
          typeof result === 'object' &&
            result !== null &&
            'message' in result &&
            typeof result.message === 'string'
            ? result.message
            : 'No se pudo desmarcar el turno.'
        );
        return;
      }
      router.replace('/admin-turnos-activos');
    } catch (requestError) {
      setError(
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

  const restantes = MAX_DESCRIPCION - descripcion.trim().length;

  return (
    <AppDrawer title="Atención del turno" onVolver={volver} etiquetaVolver="Volver">
      <ScrollView
        style={estilos.container}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>{params.mascota ?? 'Turno'}</Text>
          <Text style={styles.subtitulo}>
            {[params.tipo, params.fecha, params.hora, params.sede].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View style={styles.bloque}>
          <View style={styles.filaLabel}>
            <Text style={styles.label}>¿Qué pasó en el turno?</Text>
            <Text style={styles.contador}>
              {restantes > 0 ? `${restantes} car.` : 'máx. 500'}
            </Text>
          </View>
          <TextInput
            style={styles.textarea}
            placeholder="Ej. Aplicamos la vacuna anual, la mascota tolera bien el medicamento."
            placeholderTextColor="#8b978c"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            textAlignVertical="top"
            maxLength={MAX_DESCRIPCION}
            accessibilityLabel="Descripción de la atención"
          />
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.bloque}>
          <View style={styles.filaLabel}>
            <Text style={styles.label}>¿Agendar un turno de seguimiento?</Text>
          </View>
          <View style={styles.opcionesSiNo}>
            <Pressable
              style={({ pressed }) => [
                styles.opcionSiNo,
                !agendarSeguimiento && styles.opcionSiNoActiva,
                pressed && estilos.buttonPressed,
              ]}
              onPress={() => setAgendarSeguimiento(false)}
              accessibilityRole="radio"
              accessibilityState={{ selected: !agendarSeguimiento }}
              accessibilityLabel="No agendar un turno nuevo"
            >
              <Text
                style={[
                  styles.opcionSiNoTexto,
                  !agendarSeguimiento && styles.opcionSiNoTextoActivo,
                ]}
              >
                No
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.opcionSiNo,
                agendarSeguimiento && styles.opcionSiNoActiva,
                pressed && estilos.buttonPressed,
              ]}
              onPress={() => setAgendarSeguimiento(true)}
              accessibilityRole="radio"
              accessibilityState={{ selected: agendarSeguimiento }}
              accessibilityLabel="Sí, agendar un turno nuevo para esta mascota"
            >
              <Text
                style={[
                  styles.opcionSiNoTexto,
                  agendarSeguimiento && styles.opcionSiNoTextoActivo,
                ]}
              >
                Sí
              </Text>
            </Pressable>
          </View>
        </View>

        {agendarSeguimiento ? (
          <View style={styles.bloqueAgenda}>
            {/* Si el id de la mascota no llego, el calendario muestra su
                selector normal en vez de quedar hidden. */}
            <AvailabilityCalendar
              ref={agenda}
              escala={escalaSeguimiento}
              compacta
              ocultarBotonGuardar
              mascotaIdFija={
                Number.isInteger(mascotaId) && mascotaId > 0 ? mascotaId : null
              }
              mascotaNombreFija={params.mascota}
              sedeFija={esSedeVeterinaria(params.sede) ? params.sede : null}
              onTurnoCerrado={() => router.replace('/admin-turnos-activos')}
            />
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.guardar,
            pressed && estilos.buttonPressed,
            guardando && estilos.buttonPressed,
          ]}
          onPress={() => void guardar()}
          disabled={guardando || !descripcion.trim()}
          accessibilityRole="button"
          accessibilityLabel={
            agendarSeguimiento
              ? 'Completar el turno y agendar el seguimiento'
              : 'Guardar atención del turno'
          }
          accessibilityState={{ disabled: guardando || !descripcion.trim(), busy: guardando }}
        >
          <Text style={styles.guardarTexto}>
            {guardando ? 'Guardando...' : yaAtendido ? 'Actualizar atención' : 'Completar turno'}
          </Text>
        </Pressable>

        {yaAtendido ? (
          <Pressable
            style={({ pressed }) => [styles.desmarcar, pressed && estilos.buttonPressed]}
            onPress={() => void desmarcar()}
            disabled={guardando}
            accessibilityRole="button"
            accessibilityLabel="Desmarcar el turno como atendido"
          >
            <Text style={styles.desmarcarTexto}>Desmarcar turno</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </AppDrawer>
  );
}

const styles = {
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  encabezado: { marginBottom: 8 },
  titulo: { color: '#0f3e17', fontSize: 20, fontWeight: 'bold' as const, marginBottom: 2 },
  subtitulo: { color: '#556b58', fontSize: 12 },
  bloque: { marginBottom: 8 },
  filaLabel: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 4,
  },
  label: { color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
  textarea: {
    minHeight: 76,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
    fontSize: 14,
    lineHeight: 19,
    color: '#1e3326',
  },
  contador: { color: '#8b978c', fontSize: 11 },
  error: { marginBottom: 8, color: '#a32828', fontSize: 12, lineHeight: 17 },
  opcionesSiNo: { flexDirection: 'row' as const, gap: 8 },
  opcionSiNo: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  opcionSiNoActiva: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  opcionSiNoTexto: { color: '#1e3326', fontSize: 14, fontWeight: '600' as const },
  opcionSiNoTextoActivo: { color: '#0f3e17', fontWeight: '700' as const },
  bloqueAgenda: { marginBottom: 2 },
  guardar: {
    alignItems: 'center' as const,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  guardarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' as const },
  desmarcar: {
    alignItems: 'center' as const,
    marginTop: 8,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
  },
  desmarcarTexto: { color: '#6b7d6d', fontSize: 13, fontWeight: '600' as const },
};