import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const especies = ['Perro', 'Gato', 'Otro'];

export default function NuevaMascota() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState('');
  const [raza, setRaza] = useState('');
  const [edad, setEdad] = useState('');

  const handleSubmit = () => {
    if (!nombre.trim() || !especie || !edad.trim()) {
      Alert.alert('Faltan datos', 'Completa el nombre, la especie y la edad.');
      return;
    }
    Alert.alert('Formulario completo', 'El guardado se podrá conectar más adelante.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/mascotas')}>
          <Ionicons name="arrow-back" size={20} color="#0f3e17" />
          <Text style={styles.backText}>Mascotas</Text>
        </TouchableOpacity>

        <View style={styles.form}>
          <Text style={styles.title}>Agregar mascota</Text>
          <Text style={styles.subtitle}>Completa los datos de tu compañero.</Text>

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Luna"
            placeholderTextColor="#7a8378"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>Especie</Text>
          <View style={styles.speciesOptions}>
            {especies.map((opcion) => (
              <Pressable
                key={opcion}
                onPress={() => setEspecie(opcion)}
                accessibilityRole="radio"
                accessibilityState={{ selected: especie === opcion }}
                style={[styles.speciesOption, especie === opcion && styles.speciesOptionSelected]}
              >
                <Text
                  style={[styles.speciesText, especie === opcion && styles.speciesTextSelected]}
                >
                  {opcion}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Raza (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. mestizo"
            placeholderTextColor="#7a8378"
            value={raza}
            onChangeText={setRaza}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>Edad en años</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 2"
            placeholderTextColor="#7a8378"
            value={edad}
            onChangeText={setEdad}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>Registrar mascota</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffefc',
  },
  content: {
    flexGrow: 1,
    padding: 20,
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
    paddingTop: 22,
    paddingBottom: 28,
  },
  title: {
    color: '#0f3e17',
    fontSize: 28,
    fontWeight: 'bold',
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
  submitText: {
    color: '#fffefc',
    fontSize: 16,
    fontWeight: 'bold',
  },
});