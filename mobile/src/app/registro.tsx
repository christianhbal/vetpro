import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, Stack } from 'expo-router';

export default function Registro() {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = () => {
    if (!nombre.trim() || !email.trim() || !password || !confirmPassword) {
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
    Alert.alert('Registro listo', 'El formulario está completo.');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>VP</Text>
        </View>
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>Únete a VetPro y cuida mejor de tus mascotas.</Text>

        <TextInput
          style={styles.input}
          placeholder="Nombre completo"
          placeholderTextColor="#777"
          value={nombre}
          onChangeText={setNombre}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#777"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña (mínimo 8 caracteres)"
          placeholderTextColor="#777"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="next"
        />
        <TextInput
          style={[styles.input, styles.lastInput]}
          placeholder="Confirmar contraseña"
          placeholderTextColor="#777"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />

        <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
          <Text style={styles.registerButtonText}>Crear cuenta</Text>
        </TouchableOpacity>
        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>¿Ya tienes una cuenta? </Text>
          <Link href="/" asChild>
            <TouchableOpacity>
              <Text style={styles.loginLink}>Inicia sesión</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C8E6C9',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    width: 88,
    height: 88,
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
  loginLink: {
    color: '#1B4D3E',
    fontSize: 15,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});