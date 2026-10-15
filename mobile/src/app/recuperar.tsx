import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { estilos } from '../lib/estilos';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Pantalla de "¿Olvidaste tu contraseña? Haz clic aquí".
 *
 * Es el espejo de "Crear cuenta": mismo fondo, mismo logo, misma forma de los
 * campos y el botón. Acá solo se pide el correo, porque es lo único que hace
 * falta para saber a quién mandar el código.
 *
 * OJO, lo que falta: todavía no hay nada detrás. No existe el endpoint en el
 * backend ni hay servicio de correo configurado, así que la pantalla NO manda
 * ningún correo: muestra el aviso de "correo enviado" y listo. Cuando se arme
 * el flujo hay que reemplazar el cuerpo de `enviarRecuperacion` por la llamada
 * real, que va a ser:
 *
 *   await fetch(`${API_BASE_URL}/api/password-reset`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ email: email.trim() }),
 *   });
 *
 * y leer `result.message` para el caso de error, como en el resto de la app.
 */
export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ titulo: string; mensaje: string } | null>(null);
  const { top } = useSafeAreaInsets();

  const enviarRecuperacion = async () => {
    if (enviando) return;

    if (!email.trim()) {
      setAviso({
        titulo: 'Falta el correo',
        mensaje: 'Escribí el correo con el que te registraste.',
      });
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setAviso({
        titulo: 'Correo no válido',
        mensaje: 'Revisa el formato de tu correo electrónico.',
      });
      return;
    }

    setEnviando(true);
    try {
      // Ver el comentario de arriba del archivo: este es el lugar donde va la
      // llamada al backend cuando exista.
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
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="done"
          onSubmitEditing={enviarRecuperacion}
        />

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
            style={({ pressed }) => [
              styles.loginLinkButton,
              pressed && estilos.buttonPressed,
            ]}
            onPress={() => router.push('/')}
            accessibilityRole="link"
            accessibilityLabel="Inicia sesión"
          >
            <Text style={styles.loginLink}>Inicia sesión</Text>
          </Pressable>
        </View>
      </View>

      {/* Misma ventana que el aviso de credenciales del ingreso: fondo oscuro,
          X arriba a la derecha, título grande y el motivo en gris abajo. */}
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
  // Pregunta y pastilla en la misma línea, como en el ingreso. Esta pantalla
  // tiene una sola salida ("Inicia sesión"): el "¿No tienes una cuenta?" vive
  // en el ingreso, que es donde tiene sentido ofrecer registrarse.
  loginRow: {
    ...estilos.linkRow,
    marginTop: 24,
  },
  loginPrompt: {
    ...estilos.linkPrompt,
  },
  loginLinkButton: {
    ...estilos.linkPill,
  },
  loginLink: {
    ...estilos.linkPillText,
  },
  // Mismas medidas que el aviso de credenciales del ingreso, para que las dos
  // ventanas se vean iguales si aparecen una después de la otra.
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