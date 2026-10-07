import { useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, Stack } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '../lib/api';

type Campo = {
  id: string;
  placeholder: string;
  value: string;
  onChangeText: (texto: string) => void;
  secureTextEntry?: boolean;
  autoComplete?: 'name' | 'email' | 'new-password' | 'street-address' | 'tel';
  keyboardType?: 'email-address' | 'phone-pad';
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  esUltimo?: boolean;
};

export default function Registro() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (isSubmitting) return;

    if (!nombre.trim() || !email.trim() || !telefono.trim() || !password || !confirmPassword) {
      Alert.alert('Faltan datos', 'Completa todos los campos para continuar.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('Correo no válido', 'Revisa el formato de tu correo electrónico.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Las contraseñas no coinciden', 'Vuelve a comprobar ambas contraseñas.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          password,
          direccion: direccion.trim() || null,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        Alert.alert('No se pudo crear la cuenta', result.message ?? 'Inténtalo de nuevo.');
        return;
      }

      setPassword('');
      setConfirmPassword('');
      setDireccion('');
      Alert.alert('Cuenta creada', 'Tu usuario quedó registrado en la base de datos.');
    } catch (error) {
      Alert.alert('No hay conexión con la API', apiUnreachableMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const campos: Campo[] = [
    {
      id: 'nombre',
      placeholder: 'Nombre completo',
      value: nombre,
      onChangeText: setNombre,
      autoComplete: 'name',
      returnKeyType: 'next',
    },
    {
      id: 'email',
      placeholder: 'Correo electrónico',
      value: email,
      onChangeText: setEmail,
      keyboardType: 'email-address',
      autoComplete: 'email',
      returnKeyType: 'next',
    },
    {
      id: 'telefono',
      placeholder: 'Teléfono',
      value: telefono,
      onChangeText: setTelefono,
      autoComplete: 'tel',
      keyboardType: 'phone-pad',
      returnKeyType: 'next',
    },
    {
      id: 'direccion',
      placeholder: 'Dirección (opcional)',
      value: direccion,
      onChangeText: setDireccion,
      autoComplete: 'street-address',
      returnKeyType: 'next',
    },
    {
      id: 'password',
      placeholder: 'Contraseña (mínimo 8 caracteres)',
      value: password,
      onChangeText: setPassword,
      secureTextEntry: true,
      autoComplete: 'new-password',
      returnKeyType: 'next',
    },
    {
      id: 'confirmPassword',
      placeholder: 'Confirmar contraseña',
      value: confirmPassword,
      onChangeText: setConfirmPassword,
      secureTextEntry: true,
      autoComplete: 'new-password',
      returnKeyType: 'done',
      onSubmitEditing: handleRegister,
      esUltimo: true,
    },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={campos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>VP</Text>
            </View>
            <Text style={styles.title}>Crear cuenta</Text>
            <Text style={styles.subtitle}>Únete a VetPro y cuida mejor de tus mascotas.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.campoFila}>
            <TextInput
              style={[styles.input, item.esUltimo && styles.lastInput]}
              placeholder={item.placeholder}
              placeholderTextColor="#777"
              value={item.value}
              onChangeText={item.onChangeText}
              secureTextEntry={item.secureTextEntry}
              keyboardType={item.keyboardType}
              autoCapitalize={item.id === 'email' || item.id === 'telefono' ? 'none' : 'words'}
              autoComplete={item.autoComplete}
              returnKeyType={item.returnKeyType}
              onSubmitEditing={item.onSubmitEditing}
            />
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.registerButton,
                pressed && styles.buttonPressed,
                isSubmitting && styles.registerButtonDisabled,
              ]}
              onPress={handleRegister}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Crear cuenta"
            >
              <Text style={styles.registerButtonText}>
                {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
              </Text>
            </Pressable>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>¿Ya tienes una cuenta? </Text>
              <Link href="/" asChild>
                <Pressable
                  style={styles.loginLinkButton}
                  accessibilityRole="link"
                  accessibilityLabel="Inicia sesión"
                >
                  <Text style={styles.loginLink}>Inicia sesión</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C8E6C9',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    width: '100%',
    alignItems: 'center',
  },
  logoContainer: {
    width: '26%',
    aspectRatio: 1,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    elevation: 3,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#488c70',
  },
  title: {
    color: '#000000',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#365247',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 28,
  },
  campoFila: {
    width: '100%',
  },
  footer: {
    width: '100%',
  },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 14,
  },
  lastInput: {
    marginBottom: 24,
  },
  registerButton: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#1B4D3E',
    padding: 18,
    borderRadius: 28,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  registerButtonDisabled: {
    opacity: 0.65,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 22,
  },
  loginPrompt: {
    color: '#263b32',
    fontSize: 15,
  },
  loginLinkButton: {
    padding: 4,
  },
  loginLink: {
    color: '#1B4D3E',
    fontSize: 15,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});