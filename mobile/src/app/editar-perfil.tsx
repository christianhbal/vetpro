import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  obtenerUsuarioActual,
  guardarUsuarioActual,
  type UsuarioActual,
} from '@/lib/session';

type Campo = {
  id: 'nombre' | 'email' | 'telefono' | 'direccion';
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (texto: string) => void;
  keyboardType?: 'email-address' | 'phone-pad';
  autoComplete?: 'name' | 'email' | 'street-address' | 'tel';
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
};

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

export default function EditarPerfil() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [usuario, setUsuario] = useState<UsuarioActual | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const contenedor = useMemo(() => [estilos.formContent, { paddingTop: top }], [top]);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      setCargando(true);
      void (async () => {
        try {
          const sesion = await obtenerUsuarioActual();
          if (!sesion) {
            router.replace('/');
            return;
          }
          const response = await fetch(`${API_BASE_URL}/api/users/${sesion.id}`);
          const result: unknown = await response.json();
          if (!response.ok) {
            throw new Error(mensajeApi(result) ?? 'No se pudo cargar el perfil.');
          }
          if (
            typeof result !== 'object' ||
            result === null ||
            !('id' in result) ||
            !('nombre' in result) ||
            !('email' in result) ||
            typeof result.id !== 'number' ||
            typeof result.nombre !== 'string' ||
            typeof result.email !== 'string'
          ) {
            throw new Error('La API devolvió datos de perfil inválidos.');
          }
          if (!activo) return;

          const perfil: UsuarioActual = {
            id: result.id,
            nombre: result.nombre,
            email: result.email,
            telefono:
              'telefono' in result && typeof result.telefono === 'string'
                ? result.telefono
                : null,
            direccion:
              'direccion' in result && typeof result.direccion === 'string'
                ? result.direccion
                : null,
          };
          setUsuario(perfil);
          setNombre(perfil.nombre);
          setEmail(perfil.email);
          setTelefono(perfil.telefono ?? '');
          setDireccion(perfil.direccion ?? '');
        } catch (error) {
          if (activo) {
            Alert.alert(
              'No se pudo cargar el perfil',
              error instanceof Error ? error.message : apiUnreachableMessage(error)
            );
          }
        } finally {
          if (activo) setCargando(false);
        }
      })();

      return () => {
        activo = false;
      };
    }, [router])
  );

  const handleSubmit = async () => {
    if (guardando) return;
    if (!usuario) {
      Alert.alert('Perfil no disponible', 'Vuelve a cargar la pantalla e inténtalo nuevamente.');
      return;
    }
    if (!nombre.trim() || !email.trim() || !telefono.trim()) {
      Alert.alert('Faltan datos', 'Completa tu nombre, correo y teléfono. La dirección es opcional.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('Correo no válido', 'Revisa el formato de tu correo electrónico.');
      return;
    }

    setGuardando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          direccion: direccion.trim() || null,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        Alert.alert('No se pudo actualizar el perfil', mensajeApi(result) ?? 'Inténtalo de nuevo.');
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('id' in result) ||
        !('nombre' in result) ||
        !('email' in result) ||
        typeof result.id !== 'number' ||
        typeof result.nombre !== 'string' ||
        typeof result.email !== 'string'
      ) {
        throw new Error('La API devolvió datos de perfil inválidos.');
      }

      await guardarUsuarioActual({
        id: result.id,
        nombre: result.nombre,
        email: result.email,
        telefono:
          'telefono' in result && typeof result.telefono === 'string' ? result.telefono : null,
        direccion:
          'direccion' in result && typeof result.direccion === 'string' ? result.direccion : null,
      });
      Alert.alert('Perfil actualizado', 'Tus datos se guardaron correctamente.', [
        { text: 'Aceptar', onPress: () => router.replace('/perfil') },
      ]);
    } catch (error) {
      Alert.alert(
        'No se pudo actualizar el perfil',
        error instanceof Error ? error.message : apiUnreachableMessage(error)
      );
    } finally {
      setGuardando(false);
    }
  };

  const campos: Campo[] = [
    {
      id: 'nombre',
      label: 'Nombre completo',
      placeholder: 'Ej. Ana Gómez',
      value: nombre,
      onChangeText: setNombre,
      autoComplete: 'name',
      returnKeyType: 'next',
    },
    {
      id: 'email',
      label: 'Correo electrónico',
      placeholder: 'Ej. ana@correo.com',
      value: email,
      onChangeText: setEmail,
      keyboardType: 'email-address',
      autoComplete: 'email',
      returnKeyType: 'next',
    },
    {
      id: 'telefono',
      label: 'Teléfono',
      placeholder: 'Ej. 5551234567',
      value: telefono,
      onChangeText: setTelefono,
      keyboardType: 'phone-pad',
      autoComplete: 'tel',
      returnKeyType: 'next',
    },
    {
      id: 'direccion',
      label: 'Dirección (opcional)',
      placeholder: 'Ej. Calle 123, Ciudad',
      value: direccion,
      onChangeText: setDireccion,
      autoComplete: 'street-address',
      returnKeyType: 'done',
      onSubmitEditing: () => void handleSubmit(),
    },
  ];

  return (
    <View style={estilos.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={campos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={contenedor}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={estilos.formWrapper}>
            <Text style={estilos.formLabel}>{item.label}</Text>
            <TextInput
              style={estilos.formInput}
              placeholder={item.placeholder}
              placeholderTextColor="#7a8378"
              value={item.value}
              onChangeText={item.onChangeText}
              keyboardType={item.keyboardType}
              autoComplete={item.autoComplete}
              autoCapitalize={item.id === 'email' ? 'none' : 'words'}
              editable={!cargando && !guardando}
              returnKeyType={item.returnKeyType}
              onSubmitEditing={item.onSubmitEditing}
            />
          </View>
        )}
        ListHeaderComponent={
          <View>
            <Pressable
              style={({ pressed }) => [estilos.backButton, pressed && estilos.buttonPressed]}
              onPress={() => router.replace('/perfil')}
              accessibilityRole="button"
              accessibilityLabel="Volver a Perfil"
            >
              <Ionicons name="arrow-back" size={20} color="#0f3e17" />
              <Text style={estilos.backText}>Perfil</Text>
            </Pressable>

            <View style={estilos.formWrapper}>
              <Text style={estilos.formTitle}>Editar perfil</Text>
              <Text style={estilos.formSubtitle}>
                Actualizá tus datos. La dirección es opcional.
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={estilos.formWrapper}>
            <Pressable
              style={({ pressed }) => [
                estilos.submitButton,
                pressed && estilos.buttonPressed,
                (cargando || guardando) && { opacity: 0.65 },
              ]}
              onPress={() => void handleSubmit()}
              disabled={cargando || guardando}
              accessibilityRole="button"
              accessibilityLabel="Guardar cambios"
            >
              <Text style={estilos.submitText}>
                {cargando ? 'Cargando perfil...' : guardando ? 'Guardando...' : 'Guardar cambios'}
              </Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}
