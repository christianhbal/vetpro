import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';

const especies = ['Perro', 'Gato', 'Otro'];

type Fila =
  | { id: 'nombre'; tipo: 'texto'; label: string }
  | { id: 'especie'; tipo: 'opciones'; label: string }
  | { id: 'raza'; tipo: 'texto'; label: string }
  | { id: 'edad'; tipo: 'texto'; label: string };

export default function NuevaMascota() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState('');
  const [raza, setRaza] = useState('');
  const [edad, setEdad] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { top } = useSafeAreaInsets();

  const contenedor = useMemo(() => [styles.container, { paddingTop: top }], [top]);

  const elegirFoto = async () => {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
        base64: true,
      });
      if (resultado.canceled) return;

      const imagen = resultado.assets[0];
      if (!imagen.base64) {
        setMensaje('No se pudo leer la foto. Elige otra imagen.');
        return;
      }

      setFoto(`data:${imagen.mimeType || 'image/jpeg'};base64,${imagen.base64}`);
      setMensaje('');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo abrir la galería.');
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setMensaje('');

    const edadNumero = edad.trim() ? Number(edad) : null;
    if (!nombre.trim() || !especie) {
      setMensaje('Completa el nombre y la especie.');
      return;
    }
    if (
      edadNumero !== null &&
      (!Number.isInteger(edadNumero) || edadNumero < 0 || edadNumero > 200)
    ) {
      setMensaje('La edad debe ser un número entero entre 0 y 200.');
      return;
    }

    setIsSubmitting(true);
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mascotas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          especie,
          raza: raza.trim() || null,
          edad: edadNumero,
          foto,
          userId: usuario.id,
        }),
      });
      const resultado = await response.json();

      if (!response.ok) {
        setMensaje(resultado.message ?? 'No se pudo registrar la mascota.');
        return;
      }

      router.replace('/mascotas');
    } catch (error) {
      setMensaje(apiUnreachableMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filas: Fila[] = [
    { id: 'nombre', tipo: 'texto', label: 'Nombre' },
    { id: 'especie', tipo: 'opciones', label: 'Animal' },
    { id: 'raza', tipo: 'texto', label: 'Raza (opcional)' },
    { id: 'edad', tipo: 'texto', label: 'Edad en años' },
  ];

  const renderFila = ({ item }: { item: Fila }) => {
    if (item.tipo === 'opciones') {
      return (
        <View>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.speciesOptions}>
            {especies.map((opcion) => (
              <Pressable
                key={opcion}
                onPress={() => setEspecie(opcion)}
                accessibilityRole="radio"
                accessibilityLabel={opcion}
                accessibilityState={{ selected: especie === opcion }}
                style={({ pressed }) => [
                  styles.speciesOption,
                  especie === opcion && styles.speciesOptionSelected,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[styles.speciesText, especie === opcion && styles.speciesTextSelected]}
                >
                  {opcion}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    const valores = {
      nombre: { texto: nombre, setter: setNombre, placeholder: 'Ej. Luna', teclado: 'default' as const },
      raza: { texto: raza, setter: setRaza, placeholder: 'Ej. mestizo', teclado: 'default' as const },
      edad: { texto: edad, setter: setEdad, placeholder: 'Ej. 2', teclado: 'decimal-pad' as const },
    };
    const campo = valores[item.id as keyof typeof valores];

    return (
      <View>
        <Text style={styles.label}>{item.label}</Text>
        <TextInput
          style={styles.input}
          placeholder={campo.placeholder}
          placeholderTextColor="#7a8378"
          value={campo.texto}
          onChangeText={campo.setter}
          autoCapitalize="words"
          keyboardType={campo.teclado}
          returnKeyType={item.id === 'edad' ? 'done' : 'next'}
          onSubmitEditing={item.id === 'edad' ? handleSubmit : undefined}
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
              onPress={() => router.replace('/mascotas')}
              accessibilityRole="button"
              accessibilityLabel="Volver a Mascotas"
            >
              <Ionicons name="arrow-back" size={20} color="#0f3e17" />
              <Text style={styles.backText}>Mascotas</Text>
            </Pressable>

            <View style={styles.form}>
              <Text style={styles.title}>Agregar mascota</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.form}>
            <Text style={styles.label}>Foto (opcional)</Text>
            {foto ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: foto }} style={styles.photoPreview} />
                <Pressable
                  style={styles.removePhotoButton}
                  onPress={() => setFoto(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar foto"
                >
                  <Ionicons name="close-circle" size={28} color="#a12d2d" />
                </Pressable>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.photoButton, pressed && styles.buttonPressed]}
              onPress={elegirFoto}
              accessibilityRole="button"
              accessibilityLabel={foto ? 'Cambiar foto de mascota' : 'Elegir foto de mascota'}
            >
              <Ionicons name="image-outline" size={20} color="#0f3e17" />
              <Text style={styles.photoButtonText}>
                {foto ? 'Cambiar foto' : 'Elegir foto'}
              </Text>
            </Pressable>
            {mensaje ? <Text style={styles.errorMessage}>{mensaje}</Text> : null}
            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                pressed && styles.buttonPressed,
                isSubmitting && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Registrar mascota"
            >
              <Text style={styles.submitText}>
                {isSubmitting ? 'Guardando...' : 'Registrar mascota'}
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
  title: {
    color: '#0f3e17',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 22,
    marginBottom: 22,
  },
  label: {
    color: '#263b32',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f3f7f1',
    borderColor: '#d8e3d5',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  speciesOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  speciesOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#b9cbb6',
    borderRadius: 10,
    backgroundColor: '#fffefc',
  },
  speciesOptionSelected: {
    backgroundColor: '#e1f4df',
    borderColor: '#0f3e17',
  },
  speciesText: {
    color: '#263b32',
    fontSize: 15,
    fontWeight: '500',
  },
  speciesTextSelected: {
    color: '#0f3e17',
    fontWeight: 'bold',
  },
  photoPreviewContainer: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  photoPreview: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fffefc',
    borderRadius: 20,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#b9cbb6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  photoButtonText: {
    color: '#0f3e17',
    fontSize: 15,
    fontWeight: '600',
  },
  errorMessage: {
    color: '#a12d2d',
    fontSize: 14,
    marginBottom: 14,
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
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitText: {
    color: '#fffefc',
    fontSize: 16,
    fontWeight: 'bold',
  },
});