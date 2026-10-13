import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sedesVeterinaria, type SedeVeterinaria } from '@/lib/datos';

const CLAVE = 'vetpro.sedeSeleccionada';

function esSedeValida(valor: unknown): valor is SedeVeterinaria {
  return typeof valor === 'string' && (sedesVeterinaria as readonly string[]).includes(valor);
}

/**
 * La sede que se esta mirando, compartida entre la portada y la pantalla de
 * Turnos. Antes cada pantalla tenia su propia variable y se desincronizaban:
 * se elegia una sede en la portada y al entrar a Turnos figuraba "Todas".
 *
 * Se guarda en el dispositivo para que siga elegida al cerrar la app.
 */
export function useSedeSeleccionada(): [SedeVeterinaria, (sede: SedeVeterinaria) => void] {
  const [sede, setSede] = useState<SedeVeterinaria>('Recoleta');

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const guardado = await AsyncStorage.getItem(CLAVE);
        if (vigente && esSedeValida(guardado)) setSede(guardado);
      } catch {
        // Sin almacenamiento se queda la sede por defecto.
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const elegirSede = useCallback((nueva: SedeVeterinaria) => {
    setSede(nueva);
    void AsyncStorage.setItem(CLAVE, nueva).catch(() => {
      // Si no se puede guardar, igual queda aplicada en esta sesion.
    });
  }, []);

  return [sede, elegirSede];
}