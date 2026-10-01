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

const tiposTurno = ['Control', 'Vacunas', 'Estética'];

export default function NuevoTurno() {
  const router = useRouter();
  const [mascota, setMascota] = useState('');
  const [tipo, setTipo] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');

  const handleSubmit = () => {
    if (!mascota.trim() || !tipo || !fecha.trim() || !hora.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos y elige el tipo de turno.');
      return;
    }

    Alert.alert(
      'Formulario completo',
      'Los datos están listos. El guardado del turno se podrá conectar más adelante.'
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/turnos')}>
          <Ionicons name="arrow-back" size={20} color="#0f3e17" />
          <Text style={styles.backText}>Turnos</Text>
        </TouchableOpacity>

        <View style={styles.form}>
          <Text style={styles.title}>Agregar turno</Text>
          <Text style={styles.subtitle}>Elige el servicio y los datos de la cita.</Text>

          <Text style={styles.label}>Tipo de turno</Text>
          <View style={styles.typeOptions}>
            {tiposTurno.map((opcion) => (
              <Pressable
                key={opcion}
                onPress={() => setTipo(opcion)}
                accessibilityRole="radio"
                accessibilityState={{ selected: tipo === opcion }}
                style={[styles.typeOption, tipo === opcion && styles.typeOptionSelected]}
              >
                <Text style={[styles.typeText, tipo === opcion && styles.typeTextSelected]}>
                  {opcion}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Mascota</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre de tu mascota"
            placeholderTextColor="#7a8378"
            value={mascota}
            onChangeText={setMascota}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={styles.label}>Fecha</Text>
          <TextInput
            style={styles.input}
            placeholder="DD/MM/AAAA"
            placeholderTextColor="#7a8378"
            value={fecha}
            onChangeText={setFecha}
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
          />

          <Text style={styles.label}>Hora</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 10:30"
            placeholderTextColor="#7a8378"
            value={hora}
            onChangeText={setHora}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitText}>Continuar</Text>
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