import { StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import { estilos } from '@/lib/estilos';

const PARTE_VARIABLE = 334;

const PARTE_FIJA = 524;

const MARGEN_INFERIOR = 16;

const ESCALA_MAXIMA = 1.4;
const ESCALA_MINIMA = 0.42;

const ALTO_ENCABEZADO = 44;

export default function AgendarTurnoScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/turnos');
  };

  const disponible =
    height - insets.top - ALTO_ENCABEZADO - insets.bottom - MARGEN_INFERIOR;
  const escala = Math.max(
    ESCALA_MINIMA,
    Math.min(ESCALA_MAXIMA, (disponible - PARTE_FIJA) / PARTE_VARIABLE)
  );

  return (
    <AppDrawer title="Agendar turno" onVolver={volver} etiquetaVolver="Volver a Turnos">
      <ScrollView
        style={estilos.container}
        contentContainerStyle={styles.contenido}
        showsVerticalScrollIndicator
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

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
});
