import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { estilos } from '@/lib/estilos';

type AvisoExitoProps = {
  visible: boolean;
  titulo: string;
  subtitulo?: string;
  textoBoton?: string;
  etiquetaBoton: string;
  onCerrar: () => void;
  children?: ReactNode;
};

export function AvisoExito({
  visible,
  titulo,
  subtitulo,
  textoBoton = 'Listo',
  etiquetaBoton,
  onCerrar,
  children,
}: AvisoExitoProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCerrar}
    >
      <View style={styles.raiz}>
        <Pressable
          style={styles.fondo}
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar aviso"
        />

        {visible ? (
          <View style={styles.aviso}>
            <View style={styles.icono}>
              <Ionicons name="checkmark" size={38} color="#fffefc" />
            </View>

            <Text style={styles.titulo}>{titulo}</Text>
            {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}

            {children}

            <Pressable
              style={({ pressed }) => [styles.boton, pressed && estilos.buttonPressed]}
              onPress={onCerrar}
              accessibilityRole="button"
              accessibilityLabel={etiquetaBoton}
            >
              <Text style={styles.botonTexto}>{textoBoton}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fondo: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 32, 22, 0.55)',
  },
  aviso: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    borderRadius: 20,
    backgroundColor: '#fffefc',
  },
  icono: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderRadius: 36,
    backgroundColor: '#1f6b33',
  },
  titulo: {
    color: '#0f3e17',
    fontSize: 21,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitulo: {
    marginTop: 6,
    color: '#5c6b60',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  boton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  botonTexto: { color: '#fffefc', fontSize: 16, fontWeight: 'bold' },
});
