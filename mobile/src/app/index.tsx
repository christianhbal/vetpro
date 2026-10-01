import { useState } from 'react';
import { 
  Alert,
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { Link, router, Stack } from 'expo-router';

const demoEmail = 'demo@vetpro.com';
const demoPassword = 'vet';

export default function Index() {
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    if (email.trim().toLowerCase() !== demoEmail || password !== demoPassword) {
      Alert.alert('Datos incorrectos', 'Usa el usuario demo que aparece debajo del botón.');
      return;
    }

    router.replace('/app');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Oculta la barra superior (header) de Expo Router */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Contenedor del Logo (con texto en lugar de icono) */}
      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>VP</Text>
      </View>

      {/* Título */}
      <Text style={styles.title}>¡Bienvenido a VetPro!</Text>

      {/* Input de Correo */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Correo Electrónico"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      {/* Input de Contraseña (con botón de texto en lugar de icono) */}
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Contraseña"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity 
          onPress={() => setShowPassword(!showPassword)} 
          style={styles.toggleButton}
        >
          <Text style={styles.toggleText}>
            {showPassword ? "Ocultar" : "Ver"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Botón de Iniciar Sesión */}
      <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
        <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
      </TouchableOpacity>

      <Text style={styles.demoCredentials}>
        Usuario demo: {demoEmail}{'\n'}Contraseña: {demoPassword}
      </Text>

      {/* Botón de Registro */}
      <Link href="/registro" asChild>
        <TouchableOpacity>
          <Text style={styles.registerText}>Registrarse</Text>
        </TouchableOpacity>
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C8E6C9', // Color verde menta de fondo
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    backgroundColor: '#FFFFFF',
    width: 110,
    height: 110,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3, 
  },
  logoText: {
    fontSize: 45,
    fontWeight: '900',
    color: '#488c70', // Verde haciendo juego con el diseño
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 40,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    padding: 18,
    borderRadius: 30,
    fontSize: 16,
  },
  passwordContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    marginBottom: 30,
    paddingRight: 15,
  },
  passwordInput: {
    flex: 1,
    padding: 18,
    fontSize: 16,
  },
  toggleButton: {
    padding: 10,
  },
  toggleText: {
    color: '#488c70',
    fontWeight: 'bold',
    fontSize: 14,
  },
  loginButton: {
    backgroundColor: '#1B4D3E', // Verde oscuro para el botón
    width: '100%',
    padding: 18,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  demoCredentials: {
    color: '#263b32',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  registerText: {
    color: '#1B4D3E',
    fontSize: 16,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});