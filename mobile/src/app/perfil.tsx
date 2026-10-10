import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import {
  cerrarSesion,
  guardarUsuarioActual,
  obtenerUsuarioActual,
  type UsuarioActual,
} from '@/lib/session';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Opcion = {
  id: string;
  nombre: string;
  icon: IconName;
  color?: string;
};

const opciones: Opcion[] = [
  { id: '1', nombre: 'Editar Perfil', icon: 'person-outline' },
  { id: '2', nombre: 'Cambiar contraseña', icon: 'key-outline' },
  { id: '3', nombre: 'Soporte: Ayuda', icon: 'help-buoy-outline' },
  { id: '4', nombre: 'Cerrar Sesión', icon: 'log-out-outline', color: '#0c2f10' },
];

export default function PerfilScreen() {
  const [modalCerrarSesion, setModalCerrarSesion] = useState(false);
  const [modalAyuda, setModalAyuda] = useState(false);
  const [modalCambiarPassword, setModalCambiarPassword] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState('');
  const [usuario, setUsuario] = useState<UsuarioActual | null>(null);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      obtenerUsuarioActual()
        .then((usuarioActual) => {
          if (!activo) return;
          if (!usuarioActual) {
            router.replace('/');
            return;
          }
          setUsuario(usuarioActual);
        })
        .catch((error: unknown) => {
          console.error('No se pudo cargar el usuario actual:', error);
        });
      return () => {
        activo = false;
      };
    }, [])
  );

  const handleOpcion = (id: string) => {
    if (id === '1') {
      router.push('/editar-perfil');
      return;
    }
    if (id === '2') {
      setPasswordActual('');
      setPasswordNueva('');
      setConfirmarPassword('');
      setErrorPassword('');
      setModalCambiarPassword(true);
      return;
    }
    if (id === '3') {
      setModalAyuda(true);
      return;
    }
    setModalCerrarSesion(true);
  };

  const cambiarPassword = async () => {
    if (guardandoPassword) return;
    if (!usuario) {
      setErrorPassword('No se pudo cargar la sesión. Vuelve a iniciar sesión.');
      return;
    }
    if (!passwordActual || !passwordNueva || !confirmarPassword) {
      setErrorPassword('Completa todos los campos.');
      return;
    }
    if (passwordNueva.length < 8) {
      setErrorPassword('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== confirmarPassword) {
      setErrorPassword('Las contraseñas nuevas no coinciden.');
      return;
    }

    setGuardandoPassword(true);
    setErrorPassword('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${usuario.id}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${usuario.accessToken}`,
        },
        body: JSON.stringify({ currentPassword: passwordActual, newPassword: passwordNueva }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' &&
          result !== null &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'No se pudo cambiar la contraseña.';
        setErrorPassword(message);
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('accessToken' in result) ||
        typeof result.accessToken !== 'string' ||
        !('id' in result) ||
        result.id !== usuario.id
      ) {
        throw new Error('La API devolvió una sesión actualizada inválida.');
      }
      const sesionActualizada: UsuarioActual = {
        ...usuario,
        accessToken: result.accessToken,
      };
      await guardarUsuarioActual(sesionActualizada);
      setUsuario(sesionActualizada);
      setModalCambiarPassword(false);
      setPasswordActual('');
      setPasswordNueva('');
      setConfirmarPassword('');
      Alert.alert('Contraseña actualizada', 'Ya puedes ingresar con tu nueva contraseña.');
    } catch (error) {
      setErrorPassword(
        error instanceof TypeError
          ? apiUnreachableMessage(error)
          : error instanceof Error
            ? error.message
            : apiUnreachableMessage(error)
      );
    } finally {
      setGuardandoPassword(false);
    }
  };

  return (
    <AppDrawer title="Perfil">
      <View style={estilos.listPadding}>
        <View style={estilos.profileHeader}>
          <Text style={estilos.profileHeaderNombre}>{usuario?.nombre ?? 'Cargando perfil...'}</Text>
          {usuario ? <Text style={estilos.profileHeaderEmail}>{usuario.email}</Text> : null}
          {usuario?.telefono ? (
            <Text style={estilos.profileHeaderEmail}>{usuario.telefono}</Text>
          ) : null}
        </View>

        {opciones.map((opcion) => (
          <Pressable
            key={opcion.id}
            style={({ pressed }) => [estilos.profileOption, pressed && estilos.buttonPressed]}
            onPress={() => handleOpcion(opcion.id)}
            accessibilityRole="button"
            accessibilityLabel={opcion.nombre}
          >
            <View style={estilos.profileOptionRow}>
              <Ionicons name={opcion.icon} size={24} color={opcion.color || '#222222'} />
              <Text
                style={[
                  estilos.profileOptionText,
                  opcion.color && estilos.profileOptionTextHighlight,
                ]}
              >
                {opcion.nombre}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#222222" />
          </Pressable>
        ))}
      </View>

      <Modal
        visible={modalCambiarPassword}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          if (!guardandoPassword) setModalCambiarPassword(false);
        }}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => {
              if (!guardandoPassword) setModalCambiarPassword(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Cerrar cambio de contraseña"
          />
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitle}>Cambiar contraseña</Text>
            <TextInput
              style={[estilos.formInput, styles.passwordInput]}
              placeholder="Contraseña actual"
              value={passwordActual}
              onChangeText={setPasswordActual}
              secureTextEntry
              autoComplete="current-password"
              editable={!guardandoPassword}
            />
            <TextInput
              style={[estilos.formInput, styles.passwordInput]}
              placeholder="Nueva contraseña (mínimo 8 caracteres)"
              value={passwordNueva}
              onChangeText={setPasswordNueva}
              secureTextEntry
              autoComplete="new-password"
              editable={!guardandoPassword}
            />
            <TextInput
              style={[estilos.formInput, styles.passwordInput]}
              placeholder="Confirmar contraseña nueva"
              value={confirmarPassword}
              onChangeText={setConfirmarPassword}
              secureTextEntry
              autoComplete="new-password"
              editable={!guardandoPassword}
              returnKeyType="done"
              onSubmitEditing={() => void cambiarPassword()}
            />
            {errorPassword ? (
              <Text style={styles.passwordError} accessibilityRole="alert">
                {errorPassword}
              </Text>
            ) : null}
            <View style={estilos.modalActions}>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonNeutral]}
                onPress={() => setModalCambiarPassword(false)}
                disabled={guardandoPassword}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonPrimary]}
                onPress={() => void cambiarPassword()}
                disabled={guardandoPassword}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  {guardandoPassword ? 'Guardando...' : 'Guardar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalCerrarSesion}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setModalCerrarSesion(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setModalCerrarSesion(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitle}>¿Cerrar sesión?</Text>
            <Text style={estilos.modalText}>
              Vas a salir de tu cuenta. Vas a necesitar iniciar sesión nuevamente para entrar.
            </Text>
            <View style={estilos.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  estilos.modalButtonNeutral,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => setModalCerrarSesion(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  estilos.modalButtonPrimary,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={async () => {
                  setModalCerrarSesion(false);
                  try {
                    await cerrarSesion();
                    router.replace('/');
                  } catch (error) {
                    console.error('No se pudo cerrar la sesion:', error);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Confirmar salida"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  Salir
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalAyuda}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setModalAyuda(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setModalAyuda(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitle}>Soporte: Ayuda</Text>
            <Text style={estilos.modalText}>
              Atendemos de lunes a viernes de 9 a 18 hs. Podés llamarnos al 1234-5678 o escribirnos
              a soporte@vetpro.com
            </Text>
            <View style={estilos.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  estilos.modalButtonPrimary,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => setModalAyuda(false)}
                accessibilityRole="button"
                accessibilityLabel="Entendido"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  Entendido
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  passwordInput: {
    marginBottom: 12,
  },
  passwordError: {
    color: '#a32828',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
};