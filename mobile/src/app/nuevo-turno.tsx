import { ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import { estilos } from '@/lib/estilos';

// Reparto aproximado del alto del formulario a escala 1.
// Solo la grilla de dias y la de horarios se comprimen; el resto es fijo.
const PARTE_FIJA = 392;
const PARTE_VARIABLE = 334;
// Alto aproximado de la barra superior del drawer (padding seguro + boton).
const ALTO_ENCABEZADO = 44;

export default function AgendarTurnoScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Si se entra por un link directo no hay historial, asi que caemos a Turnos.
  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/turnos');
  };

  const disponible = height - insets.top - ALTO_ENCABEZADO - insets.bottom;
  const escala = Math.max(0.8, Math.min(1, (disponible - PARTE_FIJA) / PARTE_VARIABLE));

  return (
    <AppDrawer title="Agendar turno" onVolver={volver} etiquetaVolver="Volver a Turnos">
      <ScrollView
        style={estilos.container}
        contentContainerStyle={styles.contenido}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <AvailabilityCalendar
          escala={escala}
          onTurnoCerrado={() => router.replace('/turnos')}
        />
      </ScrollView>
    </AppDrawer>
  );
}

const styles = {
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
};