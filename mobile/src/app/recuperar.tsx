import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { estilos } from '../lib/estilos';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; mensaje: string } | null>(null);
  // Error del formulario, escrito arriba del boton. El modal queda solo para el
  // exito, que hay que reconocer a mano.
  const [error, setError] = useState('');
  const { top } = useSafeAreaInsets();

  const enviarRecuperacion = async () => {
    if (enviando) return;
    setError('');

    if (!email.trim()) {
      setError('Escribí el correo con el que te registraste.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Revisa el formato de tu correo electrónico.');
      return;
    }

    setEnviando(true);
    try {
      setAviso({
        titulo: 'Correo enviado',
        mensaje: `Si ${email.trim()} está registrado, te llega un código para crear una contraseña nueva.`,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/vetpro-logo-horizontal.jpg')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="VetPro, cuidado y bienestar"
          />
          <Text style={styles.title}>Recuperar contraseña</Text>
          <Text style={styles.subtitle}>
            Escribí tu correo y te enviamos un código para crear una contraseña nueva.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#777"
          value={email}
          onChangeText={(valor) => {
            setEmail(valor);
            setError('');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={enviarRecuperacion}
        />

        {error !== '' ? (
          <Text style={estilos.formError} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.enviarButton,
            pressed && styles.buttonPressed,
            enviando && styles.enviarButtonDisabled,
          ]}
          onPress={enviarRecuperacion}
          disabled={enviando}
          accessibilityRole="button"
          accessibilityLabel="Enviar el código por correo"
        >
          <Text style={styles.enviarButtonText}>{enviando ? 'Enviando...' : 'Enviar'}</Text>
        </Pressable>

        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>¿Recordaste la contraseña?</Text>

          <Pressable
            style={({ pressed }) => [pressed && estilos.buttonPressed]}
            onPress={() => router.push('/')}
            accessibilityRole="link"
            accessibilityLabel="Iniciar sesión"
            hitSlop={8}
          >
            <Text style={styles.loginLink}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={aviso !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setAviso(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setAviso(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar el aviso"
          />
          <View style={styles.avisoCard} accessibilityRole="alert">
            <Pressable
              style={({ pressed }) => [styles.avisoCerrar, pressed && styles.buttonPressed]}
              onPress={() => setAviso(null)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={22} color="#263b32" />
            </Pressable>

            <Text style={styles.avisoTitle}>{aviso?.titulo ?? ''}</Text>
            <Text style={styles.avisoText}>{aviso?.mensaje ?? ''}</Text>
            <Pressable
              style={({ pressed }) => [
                estilos.modalButton,
                estilos.modalButtonPrimary,
                styles.avisoBoton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => setAviso(null)}
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
    paddingHorizontal: 20,
    paddingVertical: 24,
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
    color: '#000000',
    fontSize: 26,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#365247',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
  },
  input: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
  },
  enviarButton: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#1B4D3E',
    padding: 18,
    borderRadius: 30,
    marginTop: 20,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  enviarButtonDisabled: {
    opacity: 0.65,
  },
  enviarButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginRow: {
    ...estilos.linkRow,
    marginTop: 24,
  },
  loginPrompt: {
    ...estilos.linkPrompt,
  },
  loginLink: {
    color: '#1B4D3E',
    fontSize: 15,
    fontWeight: 'bold' as const,
    textDecorationLine: 'underline',
  },
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