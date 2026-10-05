import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { fotoMascota, mascotas, type Mascota } from '@/lib/datos';

export default function MascotasScreen() {
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const { bottom } = useSafeAreaInsets();

  const pie = useMemo(
    () => [estilos.actionFooter, { paddingBottom: bottom + 24 }],
    [bottom]
  );

  return (
    <AppDrawer title="Mascotas">
      <View style={estilos.screenWithFooter}>
        <FlatList
          style={estilos.container}
data={mascotas}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [estilos.cardVertical, pressed && estilos.buttonPressed]}
              onPress={() => setMascotaSeleccionada(item)}
              accessibilityRole="button"
              accessibilityLabel={`Ver foto de ${item.nombre}`}
            >
              <Text style={estilos.cardTitle}>{item.nombre}</Text>
              <Text style={estilos.cardSubtitle}>
                {item.especie} - {item.edad}
              </Text>
            </Pressable>
          )}
        />
        <View style={pie}>
          <Link href="/nueva-mascota" asChild>
            <Pressable
              style={estilos.addPetButton}
              accessibilityRole="link"
              accessibilityLabel="Agregar mascota"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>Agregar mascota</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <Modal
        visible={mascotaSeleccionada !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMascotaSeleccionada(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setMascotaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
          />
          {mascotaSeleccionada && (
            <View style={estilos.petPhotoCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setMascotaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar foto"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
              <Image
                source={{ uri: fotoMascota }}
                style={estilos.petPhoto}
                resizeMode="contain"
                accessibilityLabel={`Foto de ${mascotaSeleccionada.nombre}`}
              />
              <Text style={estilos.cardTitle}>{mascotaSeleccionada.nombre}</Text>
              <Text style={estilos.cardSubtitle}>
                {mascotaSeleccionada.especie} - {mascotaSeleccionada.edad}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}