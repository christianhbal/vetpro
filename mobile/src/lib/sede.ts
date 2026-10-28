import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { obtenerUsuarioActual } from '@/lib/session';
import type { Sede, SedeVeterinaria } from '@/lib/datos';

const CLAVE = 'vetpro.sedeSeleccionada';

export function useSedes() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [errorSedes, setErrorSedes] = useState('');
  const [cargandoSedes, setCargandoSedes] = useState(true);
  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargandoSedes(true);
    void (async () => {
      try {
        const usuario = await obtenerUsuarioActual();
        if (!usuario) throw new Error('Inicia sesión para consultar las sedes.');
        const response = await fetch(`${API_BASE_URL}/api/sedes`, { headers: { Authorization: `Bearer ${usuario.accessToken}` } });
        const resultado: unknown = await response.json();
        if (!response.ok || !Array.isArray(resultado)) throw new Error('No se pudieron cargar las sedes.');
        if (vigente) { setSedes(resultado); setErrorSedes(''); }
      } catch (error) {
        if (vigente) { setSedes([]); setErrorSedes(error instanceof TypeError ? apiUnreachableMessage(error) : error instanceof Error ? error.message : 'No se pudieron cargar las sedes.'); }
      } finally { if (vigente) setCargandoSedes(false); }
    })();
    return () => { vigente = false; };
  }, []));
  return { sedes, errorSedes, cargandoSedes };
}

export function useSedeSeleccionada(): [SedeVeterinaria, (sede: SedeVeterinaria) => void] {
  const [sede, setSede] = useState<SedeVeterinaria>('');
  const { sedes, cargandoSedes } = useSedes();
  useFocusEffect(useCallback(() => {
    if (cargandoSedes) return;
    let vigente = true;
    void AsyncStorage.getItem(CLAVE).then((guardado) => {
      if (vigente) setSede(sedes.find((item) => item.nombre === guardado)?.nombre ?? sedes[0]?.nombre ?? '');
    }).catch(() => { if (vigente) setSede(sedes[0]?.nombre ?? ''); });
    return () => { vigente = false; };
  }, [sedes, cargandoSedes]));
  const elegirSede = useCallback((nueva: SedeVeterinaria) => {
    setSede(nueva);
    void AsyncStorage.setItem(CLAVE, nueva).catch(() => {});
  }, []);
  return [sede, elegirSede];
}
