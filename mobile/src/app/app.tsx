import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { AppDrawer } from '@/components/app-drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Mascota = {
  id: string;
  nombre: string;
  especie: string;
  edad: string;
};

type Cita = {
  id: string;
  mascota: string;
  motivo: string;
  fecha: string;
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const mascotas = [
  { id: '1', nombre: 'Lola', especie: 'Perro', edad: '3 años' },
  { id: '2', nombre: 'Mora', especie: 'Gato', edad: '2 años' },
  { id: '3', nombre: 'Tito', especie: 'Perro', edad: '5 años' },
];

const fotoMascota =
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=900&auto=format&fit=crop&q=85';

const citas = [
  { id: '1', mascota: 'Lola', motivo: 'Vacuna Antirrábica', fecha: '28 Sept - 10:00 AM' },
  { id: '2', mascota: 'Mora', motivo: 'Control de rutina', fecha: '02 Oct - 16:30 PM' },
];

export function InicioScreen() {
  const renderMascota = ({ item }: { item: Mascota }) => (
    <View style={styles.cardHorizontal}>
      <Text style={styles.cardTitle}>{item.nombre}</Text>
      <Text style={styles.cardSubtitle}>{item.especie}</Text>
    </View>
  );

  const renderCita = ({ item }: { item: Cita }) => (
    <View style={styles.cardVertical}>
      <Text style={styles.cardTitle}>{item.mascota} - {item.motivo}</Text>
      <Text style={styles.cardSubtitle}>{item.fecha}</Text>
    </View>
  );

  return (
    <AppDrawer title="VetPro">
      <FlatList
        style={styles.container}
        data={citas}
        keyExtractor={(item) => item.id}
        renderItem={renderCita}
        contentContainerStyle={styles.listPadding}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>Tus Mascotas</Text>
            <FlatList
              horizontal
              data={mascotas}
              keyExtractor={(item) => item.id}
              renderItem={renderMascota}
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalList}
            />
            <Text style={styles.sectionTitle}>Próximas Citas</Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerButtons}>
            <Pressable style={styles.primaryButton}>
              <Text style={styles.buttonTextPrimary}>Ver Historial</Text>
            </Pressable>
          </View>
        }
      />
    </AppDrawer>
  );
}

export function MascotasScreen() {
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const { bottom } = useSafeAreaInsets();

  return (
    <AppDrawer title="Mascotas">
      <View style={styles.screenWithFooter}>
        <FlatList
          style={styles.container}
          data={mascotas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cardVertical}
              onPress={() => setMascotaSeleccionada(item)}
              accessibilityRole="button"
              accessibilityLabel={`Ver foto de ${item.nombre}`}
            >
              <Text style={styles.cardTitle}>{item.nombre}</Text>
              <Text style={styles.cardSubtitle}>{item.especie} - {item.edad}</Text>
            </Pressable>
          )}
        />
        <View style={[styles.actionFooter, { paddingBottom: bottom + 24 }]}>
          <Link href="/nueva-mascota" asChild>
            <TouchableOpacity style={styles.addPetButton}>
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={styles.buttonTextPrimary}>Agregar mascota</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
      <Modal
        visible={mascotaSeleccionada !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMascotaSeleccionada(null)}
      >
        <View style={styles.petModalRoot}>
          <Pressable
            style={styles.petModalBackdrop}
            onPress={() => setMascotaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
          />
          {mascotaSeleccionada && (
            <View style={styles.petPhotoCard}>
              <Pressable
                style={styles.petPhotoClose}
                onPress={() => setMascotaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar foto"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
              <Image
                source={{ uri: fotoMascota }}
                style={styles.petPhoto}
                resizeMode="cover"
                accessibilityLabel={`Foto de ${mascotaSeleccionada.nombre}`}
              />
              <Text style={styles.cardTitle}>{mascotaSeleccionada.nombre}</Text>
              <Text style={styles.cardSubtitle}>
                {mascotaSeleccionada.especie} - {mascotaSeleccionada.edad}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}

export function TurnosScreen() {
  const { bottom } = useSafeAreaInsets();

  return (
    <AppDrawer title="Turnos">
      <View style={styles.screenWithFooter}>
        <FlatList
          style={styles.container}
          data={citas}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listPadding}
          renderItem={({ item }) => (
            <View style={styles.cardVertical}>
              <Text style={styles.cardTitle}>{item.mascota} - {item.motivo}</Text>
              <Text style={styles.cardSubtitle}>{item.fecha}</Text>
            </View>
          )}
        />
        <View style={[styles.actionFooter, { paddingBottom: bottom + 24 }]}>
          <Link href="/nuevo-turno" asChild>
            <TouchableOpacity style={styles.addTurnButton}>
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={styles.buttonTextPrimary}>Agregar turno</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </AppDrawer>
  );
}

export function PerfilScreen() {
  const opciones: { id: string; nombre: string; icon: IconName; color?: string }[] = [
    { id: '1', nombre: 'Editar Perfil', icon: 'person-outline' },
    { id: '2', nombre: 'Métodos de Pago', icon: 'card-outline' },
    { id: '3', nombre: 'Soporte: Ayuda', icon: 'help-buoy-outline' },
    { id: '4', nombre: 'Cerrar Sesión', icon: 'log-out-outline', color: '#0c2f10' },
  ];

  return (
    <AppDrawer title="Perfil">
      <View style={styles.listPadding}>
        {opciones.map((opcion) => (
          <Pressable key={opcion.id} style={styles.profileOption}>
            <View style={styles.profileOptionRow}>
              <Ionicons name={opcion.icon} size={24} color={opcion.color || '#222222'} />
              <Text style={[styles.profileOptionText, opcion.color && { color: opcion.color }]}>
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

export default function App() {
  return <InicioScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffefc',
  },
  listPadding: {
    padding: 15,
  },
  screenWithFooter: {
    flex: 1,
  },
  actionFooter: {
    paddingHorizontal: 15,
    paddingTop: 12,
    backgroundColor: '#fffefc',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d8e3d5',
  },
  horizontalList: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f3e17',
    marginBottom: 10,
    marginTop: 10,
  },
  cardHorizontal: {
    backgroundColor: '#e1f4df',
    padding: 15,
    borderRadius: 12,
    marginRight: 15,
    width: 120,
    alignItems: 'center',
    borderColor: '#efeeeb',
    borderWidth: 1,
  },
  cardVertical: {
    backgroundColor: '#b1dbb8',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderColor: '#efeeeb',
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f3e17',
    marginBottom: 5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#222222',
  },
  footerButtons: {
    marginTop: 20,
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#0f3e17',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  addPetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f3e17',
    padding: 15,
    borderRadius: 10,
  },
  petModalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  petModalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 32, 22, 0.55)',
  },
  petPhotoCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fffefc',
    borderRadius: 12,
    padding: 16,
  },
  petPhotoClose: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 1,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffefc',
    borderRadius: 20,
  },
  petPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    marginBottom: 14,
    backgroundColor: '#e1f4df',
  },
  addTurnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f3e17',
    padding: 15,
    borderRadius: 10,
  },
  secondaryButton: {
    backgroundColor: '#b6ced5',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonTextPrimary: {
    color: '#fffefc',
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: '#0f3e17',
    fontWeight: 'bold',
    fontSize: 16,
  },
  profileOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#cfe7d3',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderColor: '#efeeeb',
    borderWidth: 1,
  },
  profileOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileOptionText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#222222',
    fontWeight: '500',
  },
});