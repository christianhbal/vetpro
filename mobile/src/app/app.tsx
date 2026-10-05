import { FlatList, Pressable, Text, View } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';
import { citas, mascotas, type Cita, type Mascota } from '@/lib/datos';

export default function InicioScreen() {
  const renderMascota = ({ item }: { item: Mascota }) => (
    <View style={estilos.cardHorizontal}>
      <Text style={estilos.cardTitle}>{item.nombre}</Text>
      <Text style={estilos.cardSubtitle}>{item.especie}</Text>
    </View>
  );

  const renderCita = ({ item }: { item: Cita }) => (
    <View style={estilos.cardVertical}>
      <Text style={estilos.cardTitle}>
        {item.mascota} - {item.motivo}
      </Text>
      <Text style={estilos.cardSubtitle}>{item.fecha}</Text>
    </View>
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
            <Text style={estilos.sectionTitle}>Próximas Citas</Text>
          </View>
        }
        ListFooterComponent={
          <View style={estilos.footerButtons}>
            <Pressable
              style={({ pressed }) => [estilos.primaryButton, pressed && estilos.buttonPressed]}
              accessibilityRole="button"
              accessibilityLabel="Ver historial"
            >
              <Text style={estilos.buttonTextPrimary}>Ver Historial</Text>
            </Pressable>
          </View>
        }
      />
    </AppDrawer>
  );
}