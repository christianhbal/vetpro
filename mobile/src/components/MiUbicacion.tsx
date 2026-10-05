import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

export default function MiUbicacion() {
  const [pos, setPos] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();

        if (status !== 'granted') {
          const pedido = await Location.requestForegroundPermissionsAsync();
          if (pedido.status !== 'granted') {
            setErrorMsg('Permiso de ubicación denegado por el usuario.');
            return;
          }
        }

        const ubicacion = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setPos(ubicacion);
      } catch (error) {
        setErrorMsg(
          error instanceof Error
            ? `No se pudo obtener la ubicación: ${error.message}`
            : 'No se pudo obtener la ubicación. Activa el GPS e inténtalo de nuevo.'
        );
      }
    })();
  }, []);

  if (errorMsg) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <Text
          style={styles.settingsLink}
          onPress={() => Linking.openSettings()}
          accessibilityRole="link"
        >
          Abrir ajustes
        </Text>
      </View>
    );
  }

  if (!pos) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Buscando coordenadas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>X: {pos.coords.longitude}</Text>
      <Text style={styles.text}>Y: {pos.coords.latitude}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  text: {
    fontSize: 18,
    color: '#000',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  },
  settingsLink: {
    color: '#1B4D3E',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 8,
  },
});