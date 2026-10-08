import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL, apiUnreachableMessage } from '../lib/api';
import { obtenerUsuarioActual } from '../lib/session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [sesionAdmin, setSesionAdmin] = useState<{ accessToken: string } | null>(null);
  const [crearAdmin, setCrearAdmin] = useState(false);
  const { top } = useSafeAreaInsets();

  const contenedor = useMemo(() => [styles.container, { paddingTop: top }], [top]);

  useEffect(() => {
    let activo = true;
    void obtenerUsuarioActual().then((usuario) => {
      if (activo && usuario?.esAdmin) {
        setSesionAdmin({ accessToken: usuario.accessToken });
      }
    });
    return () => {
      activo = false;
    };
  }, []);

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
      const response = await fetch(
        `${API_BASE_URL}${sesionAdmin ? '/api/admin/users' : '/api/users'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sesionAdmin ? { Authorization: `Bearer ${sesionAdmin.accessToken}` } : {}),
          },
          body: JSON.stringify({
            nombre: nombre.trim(),
            email: email.trim(),
            telefono: telefono.trim(),
            password,
            direccion: direccion.trim() || null,
            ...(sesionAdmin ? { esAdmin: crearAdmin } : {}),
          }),
        }
      );
      const result = await response.json();

      if (!response.ok) {
        Alert.alert('No se pudo crear la cuenta', result.message ?? 'Inténtalo de nuevo.');
        return;
      }

      setPassword('');
      setConfirmPassword('');
      setDireccion('');
      setCrearAdmin(false);
      Alert.alert(
        'Cuenta creada',
        sesionAdmin
          ? `La cuenta quedó registrada como ${crearAdmin ? 'administrador' : 'usuario normal'}.`
          : 'Tu usuario quedó registrado en la base de datos.'
      );
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
    <View style={contenedor}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={campos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            {sesionAdmin ? (
              <Link href="/admin-usuarios" asChild>
                <Pressable
                  style={styles.backButton}
                  accessibilityRole="link"
                  accessibilityLabel="Volver a administrar usuarios"
                >
                  <Ionicons name="arrow-back" size={22} color="#0f3e17" />
                </Pressable>
              </Link>
            ) : null}
            <Image
              source={require('../../assets/images/vetpro-logo-horizontal.jpg')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="VetPro, cuidado y bienestar"
            />
            <View style={styles.titleRow}>
              <Text style={styles.title}>Crear cuenta</Text>
            </View>
            <Text style={styles.subtitle}>Únete a VetPro y cuida mejor de tus mascotas.</Text>
            {sesionAdmin ? (
              <View style={styles.roleSelector}>
                <Text style={styles.roleLabel}>Tipo de usuario</Text>
                {[
                  { label: 'Usuario normal', value: false },
                  { label: 'Administrador', value: true },
                ].map((option) => (
                  <Pressable
                    key={option.label}
                    style={[
                      styles.roleOption,
                      crearAdmin === option.value && styles.roleOptionSelected,
                    ]}
                    onPress={() => setCrearAdmin(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: crearAdmin === option.value }}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        crearAdmin === option.value && styles.roleOptionTextSelected,
                      ]}
                    >
                      {crearAdmin === option.value ? '●' : '○'} {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
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

            {!sesionAdmin ? (
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
            ) : null}
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
    flexGrow: 0,
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    width: '100%',
    alignItems: 'center',
    alignSelf: 'flex-start',
    position: 'relative',
  },
  logo: {
    width: 160,
    height: 63,
    marginBottom: 4,
  },
  titleRow: {
    width: '100%',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#eaf4e9',
  },
  title: {
    color: '#000000',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: '#365247',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 14,
  },
  roleSelector: {
    alignSelf: 'stretch',
    marginBottom: 22,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    backgroundColor: '#f7fbf6',
  },
  roleLabel: {
    color: '#263b32',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  roleOption: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  roleOptionSelected: {
    borderColor: '#1B4D3E',
    backgroundColor: '#eaf4e9',
  },
  roleOptionText: {
    color: '#365247',
    fontSize: 15,
    lineHeight: 20,
  },
  roleOptionTextSelected: {
    color: '#0f3e17',
    fontWeight: 'bold',
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 20,
  },
  lastInput: {
    marginBottom: 28,
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