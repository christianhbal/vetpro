import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { citas, fotoMascota, mascotas, type Cita, type Mascota } from '@/lib/datos';

export default function InicioScreen() {
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null);

  const renderMascota = ({ item }: { item: Mascota }) => (
    <Pressable
      style={({ pressed }) => [estilos.cardHorizontal, pressed && estilos.buttonPressed]}
      onPress={() => setMascotaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver foto de ${item.nombre}`}
    >
      <Text style={estilos.cardTitle}>{item.nombre}</Text>
      <Text style={estilos.cardSubtitle}>{item.especie}</Text>
    </Pressable>
  );

  const renderCita = ({ item }: { item: Cita }) => (
    <Pressable
      style={({ pressed }) => [estilos.cardVertical, pressed && estilos.buttonPressed]}
      onPress={() => setCitaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${item.mascota}`}
    >
      <Text style={estilos.cardTitle}>
        {item.mascota} - {item.motivo}
      </Text>
      <Text style={estilos.cardSubtitle}>{item.fecha}</Text>
    </Pressable>
  );

  return (
    <AppDrawer title="VetPro">
      <FlatList
        style={estilos.container}
        data={citas}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderCita}
        contentContainerStyle={estilos.listPadding}
        ListHeaderComponent={
          <View>
            <Text style={estilos.sectionTitle}>Tus Mascotas</Text>
            <FlatList
              horizontal
              data={mascotas}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderMascota}
              showsHorizontalScrollIndicator={false}
              style={estilos.horizontalList}
              contentContainerStyle={estilos.horizontalListContent}
            />
            <Link href="/escanear-qr" asChild>
              <Pressable
                style={estilos.qrBoton}
                accessibilityRole="link"
                accessibilityLabel="Escanear código QR de la veterinaria"
              >
                <View style={estilos.qrBotonFila}>
                  <Ionicons name="qr-code-outline" size={20} color="#fffefc" />
                  <Text style={estilos.buttonTextPrimary}>Escanear QR en la veterinaria</Text>
                </View>
              </Pressable>
            </Link>

            <Text style={estilos.sectionTitle}>Próximas Citas</Text>
          </View>
        }
        ListFooterComponent={
          <View style={estilos.footerButtons}>
            <Link href="/historial" asChild>
              <Pressable
                style={estilos.primaryButton}
                accessibilityRole="link"
                accessibilityLabel="Ver historial"
              >
                <Text style={estilos.buttonTextPrimary}>Ver Historial</Text>
              </Pressable>
            </Link>
          </View>
        }
      />

      <Modal
        visible={mascotaSeleccionada !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
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

      <Modal
        visible={citaSeleccionada !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setCitaSeleccionada(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setCitaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar detalle"
          />
          {citaSeleccionada && (
            <View style={estilos.modalCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setCitaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar detalle"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>

              <Text style={estilos.modalTitle}>{citaSeleccionada.mascota}</Text>
              <Text style={estilos.modalText}>Motivo: {citaSeleccionada.motivo}</Text>
              <Text style={estilos.modalText}>Fecha: {citaSeleccionada.fecha}</Text>
            </View>
          )}
        </View>
      </Modal>
    </AppDrawer>
  );
}