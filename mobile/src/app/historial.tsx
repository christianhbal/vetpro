import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { estilos } from '@/lib/estilos';
import { citas, type Cita } from '@/lib/datos';

export default function Historial() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const contenedor = useMemo(() => [estilos.formContent, { paddingTop: top }], [top]);

  const renderCita = ({ item }: { item: Cita }) => (
    <View style={estilos.historialCard}>
      <View style={estilos.historialRow}>
        <Text style={estilos.cardTitle}>{item.mascota}</Text>
        <Text style={estilos.historialFecha}>{item.fecha}</Text>
      </View>
      <Text style={estilos.cardSubtitle}>{item.motivo}</Text>
    </View>
  );

  return (
    <View style={estilos.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={citas}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={contenedor}
        renderItem={renderCita}
        ListHeaderComponent={
          <View>
            <Pressable
              style={({ pressed }) => [estilos.backButton, pressed && estilos.buttonPressed]}
              onPress={() => router.replace('/app')}
              accessibilityRole="button"
              accessibilityLabel="Volver al inicio"
            >
              <Ionicons name="arrow-back" size={20} color="#0f3e17" />
              <Text style={estilos.backText}>VetPro</Text>
            </Pressable>

            <View style={estilos.formWrapper}>
              <Text style={estilos.formTitle}>Historial</Text>
              <Text style={estilos.formSubtitle}>Todas tus consultas registradas.</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={estilos.formWrapper}>
            <Text style={estilos.modalText}>Todavía no hay consultas en tu historial.</Text>
          </View>
        }
      />
    </View>
  );
}