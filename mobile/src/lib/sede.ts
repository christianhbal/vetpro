import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { useSesion } from '@/lib/sesion-context';
import type { Sede, SedeVeterinaria } from '@/lib/datos';

const CLAVE = 'vetpro.sedeSeleccionada';
const CLAVE_FILTRO_TURNOS = 'vetpro.filtroSedeTurnos';
let escrituraFiltro: Promise<void> = Promise.resolve();

export function guardarFiltroTurnos(filtro: string): Promise<void> {
  escrituraFiltro = escrituraFiltro.catch(() => {}).then(() => AsyncStorage.setItem(CLAVE_FILTRO_TURNOS, filtro));
  return escrituraFiltro;
}

export function useFiltroTurnos(sedes: Sede[], cargando: boolean, error: string): [string, (filtro: string) => void] {
  const [filtro, setFiltro] = useState('Todas');
  const cambio = useRef(0);

  useFocusEffect(useCallback(() => {
    if (cargando || error) return;
    let vigente = true;
    const version = cambio.current;
    void escrituraFiltro.catch(() => {}).then(() => AsyncStorage.getItem(CLAVE_FILTRO_TURNOS)).then((guardado) => {
      if (!vigente || version !== cambio.current) return;
      setFiltro(guardado && (guardado === 'Todas' || sedes.some((sede) => sede.nombre === guardado)) ? guardado : 'Todas');
    }).catch(() => {
      if (vigente && version === cambio.current) setFiltro('Todas');
    });
    return () => { vigente = false; };
  }, [sedes, cargando, error]));

  const elegir = useCallback((nuevo: string) => {
    cambio.current += 1;
    setFiltro(nuevo);
    void guardarFiltroTurnos(nuevo).catch(() => {});
  }, []);
  return [filtro, elegir];
}

export function useSedes() {
  const { usuario: usuarioSesion } = useSesion();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [errorSedes, setErrorSedes] = useState('');
  const [cargandoSedes, setCargandoSedes] = useState(true);
  useFocusEffect(useCallback(() => {
    let vigente = true;
    setCargandoSedes(true);
    void (async () => {
      try {
        const usuario = usuarioSesion;
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
  }, [usuarioSesion]));
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
