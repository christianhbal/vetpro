import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Location from 'expo-location';

export default function MiUbicacion() {
  const [pos, setPos] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permiso de ubicación denegado por el usuario.');
          return;
        }

        const p = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setPos(p);
      } catch (error) {
        setErrorMsg(
          error instanceof Error
            ? `No se pudo obtener la ubicación: ${error.message}`
            : 'No se pudo obtener la ubicación. Activa el GPS e inténtalo de nuevo.',
        );
      }
    })();
  }, []);

  if (errorMsg) {
    return <Text style={{ color: 'red', fontSize: 16 }}>{errorMsg}</Text>;
  }

  if (!pos) {
    return <Text style={{ fontSize: 16, color: '#000' }}>Buscando coordenadas...</Text>;
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 18, color: '#000' }}>X: {pos.coords.longitude}</Text>
      <Text style={{ fontSize: 18, color: '#000' }}>Y: {pos.coords.latitude}</Text>
    </View>
  );
}