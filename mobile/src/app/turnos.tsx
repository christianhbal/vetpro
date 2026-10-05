import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { citas, type Cita } from '@/lib/datos';

export default function TurnosScreen() {
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null);
  const { bottom } = useSafeAreaInsets();

  const pie = useMemo(
    () => [estilos.actionFooter, { paddingBottom: bottom + 24 }],
    [bottom]
  );

  return (
    <AppDrawer title="Turnos">
      <View style={estilos.screenWithFooter}>
        <FlatList
          style={estilos.container}
          data={citas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={estilos.listPadding}
          renderItem={({ item }) => (
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
          )}
        />
        <View style={pie}>
          <Link href="/nuevo-turno" asChild>
            <Pressable
              style={estilos.addTurnButton}
              accessibilityRole="link"
              accessibilityLabel="Agregar turno"
            >
              <Ionicons name="add-circle-outline" size={22} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>Agregar turno</Text>
            </Pressable>
          </Link>
        </View>
      </View>

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