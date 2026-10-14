import { ScrollView, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppDrawer } from '@/components/app-drawer';
import { AvailabilityCalendar } from '@/components/availability-calendar';
import { estilos } from '@/lib/estilos';

// Parte del alto de la agenda que se comprime con la escala: 5 filas de dias y 3
// de horarios, a 36px cada una mas los huecos.
const PARTE_VARIABLE = 334;
// Parte que no se comprime (selectores, etiquetas, leyenda, boton). El numero
// sale de medir el formulario: antes valia 392, que era inventado, y por eso la
// escala se topaba siempre y en pantallas chicas el boton "Guardar turno"
// caia mas de 100px por debajo del borde.
const PARTE_FIJA = 524;
// Aire que se deja abajo para que "Guardar turno" no quede pegado al borde.
const MARGEN_INFERIOR = 16;
// Topes de la escala. Abajo, las celdas quedan en 18px, que es lo mas chico
// que se lee; arriba, la tablet se llena sin pasarse.
const ESCALA_MAXIMA = 1.4;
const ESCALA_MINIMA = 0.42;
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

const styles = {
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
};
