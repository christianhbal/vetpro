import { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { cerrarSesion, obtenerUsuarioActual, type UsuarioActual } from '@/lib/session';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Opcion = {
  id: string;
  nombre: string;
  icon: IconName;
  color?: string;
};

const opciones: Opcion[] = [
  { id: '1', nombre: 'Editar Perfil', icon: 'person-outline' },
  { id: '2', nombre: 'Métodos de Pago', icon: 'card-outline' },
  { id: '3', nombre: 'Soporte: Ayuda', icon: 'help-buoy-outline' },
  { id: '4', nombre: 'Cerrar Sesión', icon: 'log-out-outline', color: '#0c2f10' },
];

export default function PerfilScreen() {
  const [modalCerrarSesion, setModalCerrarSesion] = useState(false);
  const [modalAyuda, setModalAyuda] = useState(false);
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
      router.push('/metodos-pago');
      return;
    }
    if (id === '3') {
      setModalAyuda(true);
      return;
    }
    setModalCerrarSesion(true);
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

        <View style={estilos.profileOption}>
          <View style={estilos.profileOptionRow}>
            <Ionicons name="location-outline" size={24} color="#0f3e17" />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <Text style={estilos.profileOptionText}>Dirección</Text>
              <Text style={[estilos.cardSubtitle, { marginTop: 4 }]}>
                {usuario?.direccion || 'Todavía no agregaste una dirección.'}
              </Text>
            </View>
          </View>
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