import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Opcion = {
  id: string;
  nombre: string;
  icon: IconName;
  color?: string;
  onPress?: () => void;
};

const opciones: Opcion[] = [
  { id: '1', nombre: 'Editar Perfil', icon: 'person-outline' },
  { id: '2', nombre: 'Métodos de Pago', icon: 'card-outline' },
  { id: '3', nombre: 'Soporte: Ayuda', icon: 'help-buoy-outline' },
  {
    id: '4',
    nombre: 'Cerrar Sesión',
    icon: 'log-out-outline',
    color: '#0c2f10',
    onPress: () => router.replace('/'),
  },
];

export default function PerfilScreen() {
  return (
    <AppDrawer title="Perfil">
      <View style={estilos.listPadding}>
        {opciones.map((opcion) => (
          <Pressable
            key={opcion.id}
            style={({ pressed }) => [estilos.profileOption, pressed && estilos.buttonPressed]}
            onPress={opcion.onPress}
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
    </AppDrawer>
  );
}