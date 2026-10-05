import { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { estilos } from '@/lib/estilos';

export default function EscanearQr() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [escaniado, setEscaneado] = useState<string | null>(null);

  const contenedor = useMemo(() => [estilos.escanerContenedor, { paddingTop: top }], [top]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (escaniado !== null) return;
    setEscaneado(data);
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

      <View style={[estilos.escanerContenedor, { paddingTop: top }]}>
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

        <View style={estilos.escanerCamara}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={escaniado ? undefined : handleBarcodeScanned}
          />

          <View style={estilos.escanerMarco} />

          <View style={estilos.escanerPie}>
          {escaniado ? (
            <View style={estilos.escanerResultado}>
              <Text style={estilos.escanerResultadoLabel}>Código leído</Text>
              <Text style={estilos.escanerResultadoTexto}>{escaniado}</Text>

              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  estilos.modalButtonPrimary,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => setEscaneado(null)}
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
              Apuntá la cámara al código QR de la veterinaria.
            </Text>
          )}
          </View>
        </View>
      </View>
    </View>
  );
}