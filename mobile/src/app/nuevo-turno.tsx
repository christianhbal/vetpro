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

const tiposTurno = ['Control', 'Vacunas', 'Estética'];

type Fila =
  | { id: 'tipo'; tipo: 'opciones'; label: string }
  | { id: 'mascota'; tipo: 'texto'; label: string }
  | { id: 'fecha'; tipo: 'texto'; label: string }
  | { id: 'hora'; tipo: 'texto'; label: string };

export default function NuevoTurno() {
  const router = useRouter();
  const [mascota, setMascota] = useState('');
  const [tipo, setTipo] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const { top } = useSafeAreaInsets();

  const contenedor = useMemo(() => [styles.container, { paddingTop: top }], [top]);

  const handleSubmit = () => {
    if (!mascota.trim() || !tipo || !fecha.trim() || !hora.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos y elige el tipo de turno.');
      return;
    }

    Alert.alert(
      'Formulario completo',
      'Los datos están listos. El guardado del turno aún no funciona.'
    );
  };

  const filas: Fila[] = [
    { id: 'tipo', tipo: 'opciones', label: 'Tipo de turno' },
    { id: 'mascota', tipo: 'texto', label: 'Mascota' },
    { id: 'fecha', tipo: 'texto', label: 'Fecha' },
    { id: 'hora', tipo: 'texto', label: 'Hora' },
  ];

  const renderFila = ({ item }: { item: Fila }) => {
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

    const valores = {
      mascota: { texto: mascota, setter: setMascota, placeholder: 'Nombre de tu mascota' },
      fecha: { texto: fecha, setter: setFecha, placeholder: 'DD/MM/AAAA' },
      hora: { texto: hora, setter: setHora, placeholder: 'Ej. 10:30' },
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
          keyboardType={item.id === 'mascota' ? 'default' : 'numbers-and-punctuation'}
          returnKeyType={item.id === 'hora' ? 'done' : 'next'}
          onSubmitEditing={item.id === 'hora' ? handleSubmit : undefined}
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

            <View style={styles.form}>
              <Text style={styles.title}>Agregar turno</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={styles.form}>
            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && styles.buttonPressed]}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
            >
              <Text style={styles.submitText}>Confirmar</Text>
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
  buttonPressed: {
    opacity: 0.75,
  },
  submitText: {
    color: '#fffefc',
    fontSize: 16,
    fontWeight: 'bold',
  },
});