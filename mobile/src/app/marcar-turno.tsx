import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';

const MAX_DESCRIPCION = 500;

export default function MarcarTurnoScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    mascota?: string;
    tipo?: string;
    sede?: string;
    fecha?: string;
    hora?: string;
    descripcion?: string;
  }>();

  const [descripcion, setDescripcion] = useState(params.descripcion ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const turnoId = Number(params.id);
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
          <Text style={styles.label}>¿Qué pasó en el turno?</Text>
          <TextInput
            style={styles.textarea}
            placeholder="Ej. Aplicamos la vacuna anual, la mascotaTolera bien el medicamento."
            placeholderTextColor="#8b978c"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            textAlignVertical="top"
            maxLength={MAX_DESCRIPCION}
            accessibilityLabel="Descripción de la atención"
          />
          <Text style={styles.contador}>{restantes > 0 ? `${restantes} caracteres` : 'Límite alcanzado'}</Text>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
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
          accessibilityLabel="Guardar atención del turno"
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
    paddingTop: 10,
    paddingBottom: 26,
  },
  encabezado: { marginBottom: 18 },
  titulo: { color: '#0f3e17', fontSize: 24, fontWeight: 'bold' as const, marginBottom: 4 },
  subtitulo: { color: '#556b58', fontSize: 14 },
  bloque: { marginBottom: 10 },
  label: { marginBottom: 6, color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
  textarea: {
    minHeight: 160,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
    fontSize: 15,
    lineHeight: 21,
    color: '#1e3326',
  },
  contador: { marginTop: 6, color: '#6b7d6d', fontSize: 12, textAlign: 'right' as const },
  error: { marginTop: 12, color: '#a32828', fontSize: 13, lineHeight: 19 },
  guardar: {
    alignItems: 'center' as const,
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  guardarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' as const },
  desmarcar: {
    alignItems: 'center' as const,
    marginTop: 10,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
  },
  desmarcarTexto: { color: '#6b7d6d', fontSize: 14, fontWeight: '600' as const },
};