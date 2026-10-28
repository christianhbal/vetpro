import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import {
  AvailabilityCalendar,
  type AgendaHandle,
  type TurnoElegido,
} from '@/components/availability-calendar';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';
import { esSedeVeterinaria } from '@/lib/datos';
import { useSedeSeleccionada } from '@/lib/sede';

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
    atendido?: string;
    descripcion?: string;
  }>();

  const [descripcion, setDescripcion] = useState(params.descripcion ?? '');
  const [agendarSeguimiento, setAgendarSeguimiento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Los avisos de "falta algo" salen en cartel, no escritos en la pantalla.
  const [aviso, setAviso] = useState<{ titulo: string; mensaje: string } | null>(null);
  const [exito, setExito] = useState<{
    conSeguimiento: boolean;
    seguimiento: TurnoElegido | null;
  } | null>(null);
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
  // Volver a la lista de pacientes tiene que conservar la sede: sin pasarla, la
  // pantalla caia siempre en Recoleta y el veterinario atendia en una sede y
  // volvia a ver los pacientes de otra.
  const [sedeCompartida] = useSedeSeleccionada();
const sedeDeOrigen = esSedeVeterinaria(params.sede) ? params.sede : sedeCompartida;
  const esperaDeLaSede = {
    pathname: '/admin-turnos-activos',
    params: { sede: sedeDeOrigen },
  } as const;

  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(esperaDeLaSede);
  };

  const guardar = async () => {
    if (guardando) return;
    setError('');

    if (!Number.isInteger(turnoId) || turnoId <= 0) {
      setError('No se pudo identificar el turno.');
      return;
    }
    if (!descripcion.trim()) {
      // El boton siempre se puede apretar: si falta la descripcion sale el
      // aviso, en vez de dejarlo apagado sin explicar por que.
      setAviso({
        titulo: 'Falta una descripción',
        mensaje: 'Contá lo que pasó antes de completar el turno.',
      });
      return;
    }
    // Si pidio seguimiento, la fecha y la hora tienen que estar elegidas antes
    // de completar el turno.
    if (agendarSeguimiento && (!agenda.current || !agenda.current.listo || !agenda.current.elegido)) {
      setAviso({
        titulo: 'Faltan datos para agendar',
        mensaje: 'Elegí el tipo, fecha y la hora del nuevo turno.',
      });
      return;
    }

    const sesion = await obtenerUsuarioActual();
    if (!sesion?.esAdmin) {
      router.replace('/app');
      return;
    }

    setGuardando(true);
    try {
      const seguimiento = agendarSeguimiento ? agenda.current?.elegido ?? null : null;
      const response = await fetch(`${API_BASE_URL}/api/admin/turnos/${turnoId}/atendido`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sesion.accessToken}` },
        body: JSON.stringify({ descripcion: descripcion.trim(), seguimiento }),
      });
      const resultado: unknown = await response.json();
      if (!response.ok) {
        const mensaje = typeof resultado === 'object' && resultado !== null && 'message' in resultado && typeof resultado.message === 'string' ? resultado.message : 'No se pudo completar el turno.';
        throw new Error(mensaje);
      }
      setExito({ conSeguimiento: seguimiento !== null, seguimiento });
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
            <Text style={styles.label}>¿Agendar un nuevo turno?</Text>
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
              ocultarAviso
              comoAdmin
              mascotaIdFija={
                Number.isInteger(mascotaId) && mascotaId > 0 ? mascotaId : null
              }
              mascotaNombreFija={params.mascota}
              sedeFija={esSedeVeterinaria(params.sede) ? params.sede : null}
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
          disabled={guardando}
          accessibilityRole="button"
          accessibilityLabel={
            agendarSeguimiento
              ? 'Completar el turno y agendar el seguimiento'
              : 'Guardar atención del turno'
          }
          accessibilityState={{ disabled: guardando, busy: guardando }}
        >
          <Text style={styles.guardarTexto}>
            {guardando ? 'Guardando...' : 'Completar turno'}
          </Text>
        </Pressable>

      </ScrollView>

      <Modal
        visible={exito !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => router.replace(esperaDeLaSede)}
      >
        <View style={styles.avisoRaiz}>
          <Pressable
            style={styles.avisoFondo}
            onPress={() => router.replace(esperaDeLaSede)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar aviso"
          />

          {exito !== null && (
            <View style={styles.aviso}>
              <View style={styles.avisoIcono}>
                <Ionicons name="checkmark" size={38} color="#fffefc" />
              </View>

              <Text style={styles.avisoTitulo}>¡Turno completado!</Text>
              <Text style={styles.avisoSubtitulo}>
                Guardamos la atención de {params.mascota ?? 'la mascota'}.
              </Text>

              {exito.conSeguimiento && exito.seguimiento ? (
                <View style={styles.avisoSeguimiento}>
                  <Text style={styles.avisoSeguimientoTitulo}>Turno agendado</Text>
                  <Text style={styles.avisoSeguimientoTexto}>
                    {exito.seguimiento.tipo} ·{' '}
                    {new Date(`${exito.seguimiento.fecha}T12:00:00`).toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}{' '}
                    a las {exito.seguimiento.hora} hs
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [styles.avisoBoton, pressed && estilos.buttonPressed]}
                onPress={() => router.replace(esperaDeLaSede)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar y volver a los pacientes que esperan"
              >
                <Text style={styles.avisoBotonTexto}>Listo</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={aviso !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setAviso(null)}
      >
        <View style={styles.avisoRaiz}>
          <Pressable
            style={styles.avisoFondo}
            onPress={() => setAviso(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar aviso"
          />

          <View style={[styles.aviso, styles.avisoFalta]}>
            <Pressable
              style={({ pressed }) => [styles.avisoCerrar, pressed && estilos.buttonPressed]}
              onPress={() => setAviso(null)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar el aviso"
            >
              <Ionicons name="close" size={20} color="#556b58" />
            </Pressable>

            <View style={styles.avisoFaltaIcono}>
              <Ionicons name="close" size={30} color="#a5690f" />
            </View>

            <Text style={styles.avisoTitulo}>{aviso?.titulo ?? ''}</Text>
            <Text style={styles.avisoFaltaTexto}>{aviso?.mensaje ?? ''}</Text>

            <Pressable
              style={({ pressed }) => [styles.avisoBoton, pressed && estilos.buttonPressed]}
              onPress={() => setAviso(null)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar el aviso"
            >
              <Text style={styles.avisoBotonTexto}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  avisoRaiz: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
  },
  avisoFondo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 32, 22, 0.55)',
  },
  aviso: {
    width: '100%' as DimensionValue,
    maxWidth: 380,
    alignItems: 'center' as const,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    borderRadius: 20,
    backgroundColor: '#fffefc',
  },
  avisoIcono: {
    width: 72,
    height: 72,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
    borderRadius: 36,
    backgroundColor: '#1f6b33',
  },
  avisoTitulo: {
    color: '#0f3e17',
    fontSize: 21,
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
  },
  avisoSubtitulo: {
    marginTop: 6,
    color: '#5c6b60',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center' as const,
  },
  avisoSeguimiento: {
    alignSelf: 'stretch' as const,
    gap: 4,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#b9ddba',
    backgroundColor: '#e8f3e4',
  },
  avisoSeguimientoTitulo: {
    color: '#0f3e17',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  avisoSeguimientoTexto: {
    color: '#3d5546',
    fontSize: 14,
    lineHeight: 20,
    textTransform: 'capitalize' as const,
  },
  avisoBoton: {
    alignSelf: 'stretch' as const,
    alignItems: 'center' as const,
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  avisoBotonTexto: { color: '#fffefc', fontSize: 16, fontWeight: 'bold' as const },
  // Padding extra arriba para que la X de la esquina y la X de error no queden
  // alineadas en la misma altura.
  avisoFalta: { paddingTop: 48 },
  avisoFaltaIcono: {
    width: 54,
    height: 54,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 14,
    borderRadius: 27,
    backgroundColor: '#f7e7cd',
  },
  avisoCerrar: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 16,
    backgroundColor: '#eef4ea',
  },
  avisoFaltaTexto: {
    marginTop: 6,
    color: '#5c6b60',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center' as const,
  },
};