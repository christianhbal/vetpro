import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TurnoDateTimeField from '../components/turno-date-time-field';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import {
  descripcionEspecieMascota,
  esSedeVeterinaria,
  sedesVeterinaria,
  type SedeVeterinaria,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

const tiposTurno = ['Control', 'Vacunas', 'Estética'];

function convertirFechaApi(value: string): string | null {
  const input = value.trim();
  let fecha: string;
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const localMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(input);

  if (isoMatch) {
    fecha = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  } else if (localMatch) {
    fecha = `${localMatch[3]}-${localMatch[2].padStart(2, '0')}-${localMatch[1].padStart(2, '0')}`;
  } else {
    return null;
  }

  const [year, month, day] = fecha.split('-').map(Number);
  const comprobacion = new Date(Date.UTC(year, month - 1, day));
  return comprobacion.getUTCFullYear() === year &&
    comprobacion.getUTCMonth() + 1 === month &&
    comprobacion.getUTCDate() === day
    ? fecha
    : null;
}

function mensajeDeRespuesta(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

type MascotaPropia = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
};

type Fila =
  | { id: 'tipo'; tipo: 'opciones'; label: string }
  | { id: 'sede'; tipo: 'sede'; label: string }
  | { id: 'mascota'; tipo: 'mascotas'; label: string }
  | { id: 'fecha'; tipo: 'texto'; label: string }
  | { id: 'hora'; tipo: 'texto'; label: string };

export default function NuevoTurno() {
  const router = useRouter();
  const [mascotas, setMascotas] = useState<MascotaPropia[]>([]);
  const [mascotaId, setMascotaId] = useState<number | null>(null);
  const [tipo, setTipo] = useState('');
  const [sede, setSede] = useState<SedeVeterinaria | ''>('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [cargandoMascotas, setCargandoMascotas] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorMascotas, setErrorMascotas] = useState('');
  const [mensajeFormulario, setMensajeFormulario] = useState('');
  const [esError, setEsError] = useState(false);
  const { top } = useSafeAreaInsets();

  const contenedor = useMemo(() => [styles.container, { paddingTop: top }], [top]);

  const descripcionMascota = (mascota: MascotaPropia) =>
    [mascota.nombre, descripcionEspecieMascota(mascota.especie, mascota.raza)]
      .filter((dato): dato is string => Boolean(dato))
      .join(' · ');

  const cargarMascotas = useCallback(async () => {
    setCargandoMascotas(true);
    setErrorMascotas('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado = await response.json();
      if (!response.ok) {
        setErrorMascotas(resultado.message ?? 'No se pudieron cargar tus mascotas.');
        setMascotas([]);
        return;
      }

      setMascotas(resultado);
      setMascotaId((seleccionActual) =>
        resultado.some((mascota: MascotaPropia) => mascota.id === seleccionActual)
          ? seleccionActual
          : null
      );
    } catch (error) {
      setErrorMascotas(apiUnreachableMessage(error));
      setMascotas([]);
    } finally {
      setCargandoMascotas(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const handleSubmit = async () => {
    setMensajeFormulario('');
    if (mascotaId === null || !tipo || !sede || !fecha.trim() || !hora.trim()) {
      setMensajeFormulario('Completa todos los campos y elige una mascota, un tipo y una sede.');
      setEsError(true);
      return;
    }

    const fechaApi = convertirFechaApi(fecha);
    if (!fechaApi) {
      setMensajeFormulario('La fecha no es válida. Ingresa DD/MM/AAAA, por ejemplo 7/10/2026.');
      setEsError(true);
      return;
    }
    const horaNormalizada = hora.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(horaNormalizada)) {
      setMensajeFormulario('La hora no es válida. Usa el formato de 24 horas, por ejemplo 10:30.');
      setEsError(true);
      return;
    }

    setGuardando(true);
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/turnos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: usuario.id,
          mascotaId,
          tipo,
          sede,
          fecha: fechaApi,
          hora: horaNormalizada,
        }),
      });
      const resultado: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMensajeFormulario(
          mensajeDeRespuesta(resultado) ??
            (response.status === 404
              ? 'La API no reconoce el guardado de turnos. Reinicia el backend desde la carpeta backend.'
              : `No se pudo guardar el turno (error ${response.status}).`)
        );
        setEsError(true);
        return;
      }
      setEsError(false);
      router.replace('/turnos');
    } catch (error) {
      setMensajeFormulario(apiUnreachableMessage(error));
      setEsError(true);
    } finally {
      setGuardando(false);
    }
  };

  const filas: Fila[] = [
    { id: 'tipo', tipo: 'opciones', label: 'Tipo de turno' },
    { id: 'sede', tipo: 'sede', label: 'Sede de la veterinaria' },
    { id: 'mascota', tipo: 'mascotas', label: 'Mascota' },
    { id: 'fecha', tipo: 'texto', label: 'Fecha' },
    { id: 'hora', tipo: 'texto', label: 'Hora' },
  ];

  const renderFila = ({ item }: { item: Fila }) => {
    if (item.tipo === 'sede') {
      return (
        <View>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.petPicker}>
            <Picker
              selectedValue={sede}
              onValueChange={(value) => {
                if (value === '' || esSedeVeterinaria(value)) setSede(value);
              }}
              mode="dropdown"
              accessibilityLabel="Seleccionar sede"
              style={styles.petPickerControl}
            >
              <Picker.Item label="Seleccionar sede" value="" enabled={false} />
              {sedesVeterinaria.map((opcion) => (
                <Picker.Item key={opcion} label={opcion} value={opcion} />
              ))}
            </Picker>
          </View>
        </View>
      );
    }

    if (item.tipo === 'opciones') {
      return (
        <View>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.typeOptions}>
            {tiposTurno.map((opcion) => (
              <Pressable
                key={opcion}
                onPress={() => setTipo(opcion)}
                accessibilityRole="radio"
                accessibilityLabel={opcion}
                accessibilityState={{ selected: tipo === opcion }}
                style={({ pressed }) => [
                  styles.typeOption,
                  tipo === opcion && styles.typeOptionSelected,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={[styles.typeText, tipo === opcion && styles.typeTextSelected]}>
                  {opcion}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    if (item.tipo === 'mascotas') {
      return (
        <View>
          <Text style={styles.label}>{item.label}</Text>
          {cargandoMascotas ? (
            <ActivityIndicator color="#0f3e17" style={styles.mascotasLoading} />
          ) : mascotas.length > 0 ? (
            <View style={styles.petPicker}>
              <Picker
                selectedValue={mascotaId ?? ''}
                onValueChange={(value) => setMascotaId(value === '' ? null : Number(value))}
                mode="dropdown"
                accessibilityLabel="Seleccionar mascota"
                style={styles.petPickerControl}
              >
                <Picker.Item label="Seleccionar mascota" value="" enabled={false} />
                {mascotas.map((mascota) => (
                  <Picker.Item
                    key={mascota.id}
                    label={descripcionMascota(mascota)}
                    value={mascota.id}
                  />
                ))}
              </Picker>
            </View>
          ) : (
            <Text style={styles.petListMessage}>
              {errorMascotas || 'Todavía no tienes mascotas. Registra una para agregar un turno.'}
            </Text>
          )}
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.label}>{item.label}</Text>
        <TurnoDateTimeField
          tipo={item.id}
          valor={item.id === 'fecha' ? fecha : hora}
          onChange={item.id === 'fecha' ? setFecha : setHora}
        />
      </View>
    );
  };

  return (
    <View style={contenedor}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={filas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        renderItem={renderFila}
        ListHeaderComponent={
          <View>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
              onPress={() => router.replace('/turnos')}
              accessibilityRole="button"
              accessibilityLabel="Volver a Turnos"
            >
              <Ionicons name="arrow-back" size={20} color="#0f3e17" />
              <Text style={styles.backText}>Turnos</Text>
            </Pressable>

            <View style={styles.titleContainer}>
              <Text style={styles.title}>Agregar turno</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.form}>
            {mensajeFormulario ? (
              <Text
                accessibilityRole="alert"
                style={[styles.feedback, esError ? styles.feedbackError : styles.feedbackSuccess]}
              >
                {mensajeFormulario}
              </Text>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
              onPress={() => void handleSubmit()}
              disabled={guardando}
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
            >
              <Text style={styles.submitText}>
                {guardando ? 'Guardando...' : 'Confirmar'}
              </Text>
            </Pressable>
          </View>
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffefc',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
  },
  backText: {
    color: '#0f3e17',
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    color: '#0f3e17',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 22,
    marginBottom: 22,
    textAlign: 'center',
  },
  label: {
    color: '#263b32',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  typeOptions: {
    gap: 10,
    marginBottom: 22,
  },
  typeOption: {
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#b9cbb6',
    borderRadius: 10,
    backgroundColor: '#fffefc',
  },
  typeOptionSelected: {
    backgroundColor: '#e1f4df',
    borderColor: '#0f3e17',
  },
  typeText: {
    color: '#263b32',
    fontSize: 15,
    fontWeight: '500',
  },
  typeTextSelected: {
    color: '#0f3e17',
    fontWeight: 'bold',
  },
  mascotasLoading: {
    marginVertical: 16,
  },
  petPicker: {
    borderWidth: 1,
    borderColor: '#b9cbb6',
    borderRadius: 10,
    backgroundColor: '#f3f7f1',
    marginBottom: 20,
    overflow: 'hidden',
  },
  petPickerControl: {
    height: 50,
    color: '#263b32',
  },
  petListMessage: {
    color: '#555d54',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  feedback: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 12,
  },
  feedbackError: {
    color: '#a32828',
  },
  feedbackSuccess: {
    color: '#0f3e17',
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#0f3e17',
    borderRadius: 10,
    padding: 16,
    marginTop: 6,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  submitText: {
    color: '#fffefc',
    fontSize: 16,
    fontWeight: 'bold',
  },
});