import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { citas } from '@/lib/datos';

export default function TurnosScreen() {
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
            <View style={estilos.cardVertical}>
              <Text style={estilos.cardTitle}>
                {item.mascota} - {item.motivo}
              </Text>
              <Text style={estilos.cardSubtitle}>{item.fecha}</Text>
            </View>
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
    </AppDrawer>
  );
}