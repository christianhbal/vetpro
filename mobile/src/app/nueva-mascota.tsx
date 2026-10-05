import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { top } = useSafeAreaInsets();

  const contenedor = useMemo(() => [styles.container, { paddingTop: top }], [top]);

  const handleSubmit = () => {
    if (!nombre.trim() || !especie || !edad.trim()) {
      Alert.alert('Faltan datos', 'Completa el nombre, la especie y la edad.');
      return;
    }
    Alert.alert('Formulario completo', 'El guardado se podrá conectar más adelante.');
  };

  const filas: Fila[] = [
    { id: 'nombre', tipo: 'texto', label: 'Nombre' },
    { id: 'especie', tipo: 'opciones', label: 'Especie' },
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
              <Text style={styles.subtitle}>Completa los datos de tu compañero.</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.form}>
            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel="Registrar mascota"
            >
              <Text style={styles.submitText}>Registrar mascota</Text>
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
  },
  subtitle: {
    color: '#555d54',
    fontSize: 15,
    marginTop: 8,
    marginBottom: 26,
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