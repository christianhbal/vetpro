import { useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { CHECK_IN_QR } from '@/lib/check-in';
import { obtenerUsuarioActual } from '@/lib/session';

export default function EscanearQr() {
  const router = useRouter();
  const { top, bottom } = useSafeAreaInsets();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [escaniado, setEscaneado] = useState<string | null>(null);
  const [resultado, setResultado] = useState('');
  const [llegadaRegistrada, setLlegadaRegistrada] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const escaneoEnCurso = useRef(false);
  const [vistaCamara, setVistaCamara] = useState({ width: 0, height: 0 });
  const [altoPie, setAltoPie] = useState(0);

  const contenedor = useMemo(
    () => [estilos.escanerContenedor, { paddingTop: top, paddingBottom: bottom }],
    [bottom, top]
  );
  const altoEscaneo = Math.max(0, vistaCamara.height - altoPie);
  const tamanoMarco = Math.min(vistaCamara.width * 0.76, altoEscaneo * 0.72, 320);
  const posicionMarco = {
    top: Math.max(0, (altoEscaneo - tamanoMarco) / 2),
    left: (vistaCamara.width - tamanoMarco) / 2,
    width: tamanoMarco,
    height: tamanoMarco,
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (escaneoEnCurso.current) return;
    escaneoEnCurso.current = true;
    setEscaneado(data);
    setProcesando(true);
    setLlegadaRegistrada(false);
    try {
      if (data !== CHECK_IN_QR) {
        throw new Error('Este no es el código QR de llegada de VetPro.');
      }
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      if (usuario.esAdmin) {
        throw new Error('El registro de llegada está disponible para cuentas de usuario.');
      }

      const response = await fetch(`${API_BASE_URL}/api/turnos/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${usuario.accessToken}`,
        },
        body: JSON.stringify({ code: data }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === 'object' &&
          result !== null &&
          'message' in result &&
          typeof result.message === 'string'
            ? result.message
            : 'No se pudo registrar la llegada.';
        throw new Error(message);
      }
      setLlegadaRegistrada(true);
      setResultado('Tu llegada quedó registrada correctamente.');
    } catch (error) {
      setResultado(
        error instanceof TypeError
          ? apiUnreachableMessage(error)
          : error instanceof Error
            ? error.message
            : apiUnreachableMessage(error)
      );
    } finally {
      setProcesando(false);
    }
  };

  if (!permiso) {
    return <View style={estilos.container} />;
  }

  if (!permiso.granted) {
    return (
      <View style={estilos.container}>
        <View style={contenedor}>
          <Pressable
            style={({ pressed }) => [estilos.backButton, pressed && estilos.buttonPressed]}
            onPress={() => router.replace('/app')}
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio"
          >
            <Ionicons name="arrow-back" size={20} color="#0f3e17" />
            <Text style={estilos.backText}>VetPro</Text>
          </Pressable>

          <View style={estilos.escanerMensaje}>
            <Ionicons name="camera-outline" size={44} color="#0f3e17" />
            <Text style={estilos.escanerMensajeTitulo}>Escanear QR</Text>
            <Text style={estilos.escanerMensajeTexto}>
              Se necesita la cámara para leer el código QR del veterinario.
            </Text>

            <Pressable
              style={({ pressed }) => [estilos.submitButton, pressed && estilos.buttonPressed]}
              onPress={async () => {
                const pedido = await pedirPermiso();
                if (!pedido.granted) {
                  Alert.alert(
                    'Permiso denegado',
                    'Sin la cámara no se puede escanear. Podés habilitarla desde los ajustes del sistema.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
                    ]
                  );
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Dar permiso de cámara"
            >
              <Text style={estilos.submitText}>Permitir cámara</Text>
            </Pressable>

            {!permiso.canAskAgain && (
              <Pressable
                style={({ pressed }) => [estilos.modalButton, pressed && estilos.buttonPressed]}
                onPress={() => Linking.openSettings()}
                accessibilityRole="button"
                accessibilityLabel="Abrir ajustes"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                  Abrir ajustes
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={estilos.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={contenedor}>
        <View style={estilos.escanerBarraSuperior}>
          <Pressable
            style={({ pressed }) => [estilos.escanerVolver, pressed && estilos.buttonPressed]}
            onPress={() => router.replace('/app')}
            accessibilityRole="button"
            accessibilityLabel="Volver al inicio"
          >
            <Ionicons name="arrow-back" size={20} color="#263b32" />
            <Text style={estilos.escanerVolverTexto}>Volver</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [estilos.escanerCerrar, pressed && estilos.buttonPressed]}
            onPress={() => router.replace('/app')}
            accessibilityRole="button"
            accessibilityLabel="Cerrar escáner"
          >
            <Ionicons name="close" size={26} color="#263b32" />
          </Pressable>
        </View>

        <View
          style={estilos.escanerCamara}
          onLayout={({ nativeEvent }) => {
            const { width, height } = nativeEvent.layout;
            setVistaCamara({ width, height });
          }}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={escaniado ? undefined : handleBarcodeScanned}
          />

          <View style={[estilos.escanerMarco, posicionMarco]} />

          <View
            style={estilos.escanerPie}
            onLayout={({ nativeEvent }) => setAltoPie(nativeEvent.layout.height)}
          >
            {escaniado ? (
              <View style={estilos.escanerResultado}>
                <Text style={estilos.escanerResultadoLabel}>
                  {procesando
                    ? 'Registrando llegada...'
                    : llegadaRegistrada
                      ? 'Llegada registrada'
                      : 'No se pudo registrar'}
                </Text>
                <Text style={estilos.escanerResultadoTexto}>{resultado}</Text>

                <Pressable
                  style={({ pressed }) => [
                    estilos.modalButton,
                    estilos.modalButtonPrimary,
                    pressed && estilos.buttonPressed,
                  ]}
                  disabled={procesando}
                  onPress={() => {
                    escaneoEnCurso.current = false;
                    setEscaneado(null);
                    setResultado('');
                    setLlegadaRegistrada(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Escanear otro código"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                    Escanear otro
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={estilos.escanerInstruccion}>
                Apuntá la cámara al código QR de llegada de VetPro.
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}