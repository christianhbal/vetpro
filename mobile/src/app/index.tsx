import { useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '../lib/api';
import { guardarUsuarioActual } from '../lib/session';
import { registrarNotificacionesPush } from '../lib/push';

type Campo = {
  id: string;
  placeholder: string;
  value: string;
  onChangeText: (texto: string) => void;
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'current-password';
  keyboardType?: 'email-address';
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
};

export default function Index() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      Alert.alert('Faltan datos', 'Ingresa tu correo y contraseña.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json();

      if (!response.ok) {
        Alert.alert('No se pudo iniciar sesión', result.message ?? 'Revisa tus credenciales.');
        return;
      }

      if (
        !Number.isInteger(result.id) ||
        typeof result.nombre !== 'string' ||
        typeof result.email !== 'string' ||
        typeof result.esAdmin !== 'boolean' ||
        typeof result.accessToken !== 'string'
      ) {
        Alert.alert('No se pudo iniciar sesión', 'La API devolvió datos de usuario inválidos.');
        return;
      }

      await guardarUsuarioActual({
        id: result.id,
        nombre: result.nombre,
        email: result.email,
        telefono: typeof result.telefono === 'string' ? result.telefono : null,
        esAdmin: result.esAdmin,
        accessToken: result.accessToken,
      });
      router.replace('/app');
      try {
        const avisoPush = await registrarNotificacionesPush({
          id: result.id,
          nombre: result.nombre,
          email: result.email,
          telefono: typeof result.telefono === 'string' ? result.telefono : null,
          esAdmin: result.esAdmin,
          accessToken: result.accessToken,
        });
        if (avisoPush) {
          Alert.alert('Notificaciones push no activadas', avisoPush);
        }
      } catch (pushError) {
        console.error('No se pudo registrar el dispositivo para notificaciones push:', pushError);
        Alert.alert(
          'No se pudieron activar las notificaciones push',
          pushError instanceof Error ? pushError.message : 'Inténtalo nuevamente más tarde.'
        );
      }
    } catch (error) {
      Alert.alert('No hay conexión con la API', apiUnreachableMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const campos: Campo[] = [
    {
      id: 'email',
      placeholder: 'Correo Electrónico',
      value: email,
      onChangeText: setEmail,
      keyboardType: 'email-address',
      autoComplete: 'email',
      returnKeyType: 'next',
    },
    {
      id: 'password',
      placeholder: 'Contraseña',
      value: password,
      onChangeText: setPassword,
      secureTextEntry: !showPassword,
      autoComplete: 'current-password',
      returnKeyType: 'done',
      onSubmitEditing: handleLogin,
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
            <Image
              source={require('../../assets/images/vetpro-logo-horizontal.jpg')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="VetPro, cuidado y bienestar"
            />
            <Text style={styles.title}>¡Bienvenido a VetPro!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={item.placeholder}
              placeholderTextColor="#999"
              value={item.value}
              onChangeText={item.onChangeText}
              secureTextEntry={item.secureTextEntry}
              keyboardType={item.keyboardType}
              autoCapitalize="none"
              autoComplete={item.autoComplete}
              returnKeyType={item.returnKeyType}
              onSubmitEditing={item.onSubmitEditing}
            />
            {item.id === 'password' ? (
              <Pressable
                style={styles.toggleButton}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                <Text style={styles.toggleText}>{showPassword ? 'Ocultar' : 'Ver'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.buttonPressed,
                isSubmitting && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
            >
              <Text style={styles.loginButtonText}>
                {isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Text>
            </Pressable>

            <View style={styles.registerRow}>
              <Link href="/registro" asChild>
                <Pressable
                  style={styles.registerButton}
                  accessibilityRole="link"
                  accessibilityLabel="Registrarse"
                >
                  <Text style={styles.registerText}>Registrarse</Text>
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
    padding: 20,
  },
  header: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    width: 160,
    height: 63,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#000000',
  },
  footer: {
    width: '100%',
  },
  inputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    marginBottom: 15,
    paddingRight: 15,
  },
  input: {
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
    backgroundColor: '#1B4D3E',
    width: '100%',
    padding: 18,
    borderRadius: 30,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  registerRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  registerButton: {
    padding: 8,
  },
  registerText: {
    color: '#1B4D3E',
    fontSize: 16,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
});