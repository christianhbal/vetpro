import { useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL, apiUnreachableMessage } from '../lib/api';
import { estilos } from '../lib/estilos';
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
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      Alert.alert('Faltan datos', 'Ingresa tu correo y contraseña.');
      return;
    }

    // El error va escrito en el formulario, no en un cartel del sistema: el
    // cartel no existe en la web (react-native-web no lo implementa), asi que
    // en el navegador no se vería nada, y además el dueño ve el motivo al
    // lado de los campos que tiene que corregir.
    setError('');

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? 'Revisa tus credenciales.');
        return;
      }

      if (
        !Number.isInteger(result.id) ||
        typeof result.nombre !== 'string' ||
        typeof result.email !== 'string' ||
        typeof result.esAdmin !== 'boolean' ||
        typeof result.accessToken !== 'string'
      ) {
        setError('La API devolvió datos de usuario inválidos.');
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

            <View style={styles.olvideRow}>
              <Text style={styles.olvidePrompt}>¿Olvidaste tu contraseña?</Text>
              <Pressable
                style={({ pressed }) => [styles.olvideButton, pressed && estilos.buttonPressed]}
                onPress={() => router.push('/recuperar')}
                accessibilityRole="link"
                accessibilityLabel="Haz clic aquí"
              >
                <Text style={styles.olvideText}>Haz clic aquí</Text>
              </Pressable>
            </View>

            <View style={styles.registerRow}>
              <Text style={styles.registerPrompt}>¿No tienes una cuenta?</Text>
              <Pressable
                style={({ pressed }) => [styles.registerButton, pressed && estilos.buttonPressed]}
                onPress={() => router.push('/registro')}
                accessibilityRole="link"
                accessibilityLabel="Registrarse"
              >
                <Text style={styles.registerText}>Registrarse</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      {/* El error va en una ventana propia y no en un Alert.alert: ese cartel es
          del sistema y react-native-web no lo implementa, así que en el
          navegador no se vería nada. */}
      <Modal
        visible={error !== ''}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setError('')}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setError('')}
            accessibilityRole="button"
            accessibilityLabel="Cerrar el aviso"
          />
          <View style={styles.avisoCard} accessibilityRole="alert">
            <Pressable
              style={({ pressed }) => [styles.avisoCerrar, pressed && styles.buttonPressed]}
              onPress={() => setError('')}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={22} color="#263b32" />
            </Pressable>

            <Text style={styles.avisoTitle}>No se pudo iniciar sesión</Text>
            <Text style={styles.avisoText}>{error}</Text>
            <Pressable
              style={({ pressed }) => [
                estilos.modalButton,
                estilos.modalButtonPrimary,
                styles.avisoBoton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => setError('')}
              accessibilityRole="button"
              accessibilityLabel="Entendido"
            >
              <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                Entendido
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    // En la web el campo es un <input> de verdad, y el navegador lo pinta con
    // esquinas rectas y a veces con fondo (cuando autocompleta). Como la
    // pastilla es redondeada, ese cuadrado asomaba por las esquinas derechas y
    // se veía una manchita blanca pegada al borde. Con overflow hidden el
    // recorte lo hace la pastilla y no el input.
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    // Sin esto el input no baja nunca de su ancho mínimo propio del navegador
    // (unos 217px) y en pantallas angostas se sale de la pastilla por la
    // derecha. Con minWidth 0 sí se encoge hasta el ancho que le queda.
    minWidth: 0,
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
    ...estilos.linkRow,
    marginTop: 20,
  },
  registerPrompt: {
    ...estilos.linkPrompt,
  },
  registerButton: {
    ...estilos.linkPill,
  },
  registerText: {
    ...estilos.linkPillText,
  },
  // Las dos salidas quedan como una sola línea: la pregunta en texto plano y
  // la pastilla con la acción a la derecha. Antes la pastilla abarcaba todo el
  // texto (pregunta incluida) y salía un botón enorme.
  olvideRow: {
    ...estilos.linkRow,
    marginTop: 18,
  },
  olvidePrompt: {
    ...estilos.linkPrompt,
  },
  olvideButton: {
    ...estilos.linkPill,
  },
  olvideText: {
    ...estilos.linkPillText,
  },
  // Un solo botón, asi que al medio de la ventana y no pegado a la derecha
  // como en los formularios, donde conviven con otro botón.
  accionesCentradas: {
    justifyContent: 'center',
  },
  // A diferencia de las ventanas de formulario, que tienen campos para
  // completar y por eso van con el texto a la izquierda, esta es un aviso: no
  // hay nada que completar, se lee y se cierra. Por eso todo va centrado y
  // lleva aire arriba para que la X de la esquina no se monte sobre el título.
  avisoCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fffefc',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 28,
    alignItems: 'center',
  },
  avisoCerrar: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e1f4df',
    borderRadius: 18,
  },
  avisoTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f3e17',
    textAlign: 'center',
    marginBottom: 8,
  },
  avisoText: {
    fontSize: 14,
    color: '#6b6b6b',
    lineHeight: 20,
    textAlign: 'center',
  },
  avisoBoton: {
    marginTop: 24,
    alignSelf: 'stretch',
  },
});