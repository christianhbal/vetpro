import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cerrarSesion as borrarSesionGuardada,
  guardarUsuarioActual as persistirUsuario,
  obtenerUsuarioActual,
  type UsuarioActual,
} from './session';

type Sesion = {
  usuario: UsuarioActual | null;
  guardarUsuarioActual: (usuario: UsuarioActual) => Promise<void>;
  cerrarSesion: () => Promise<void>;
};

const SesionContext = createContext<Sesion | undefined>(undefined);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioActual | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    obtenerUsuarioActual()
      .then((guardado) => { if (activo) setUsuario(guardado); })
      .catch(() => { if (activo) setError('No se pudo recuperar la sesión. Intentá nuevamente.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [intento]);

  const guardarUsuarioActual = useCallback(async (nuevoUsuario: UsuarioActual) => {
    await persistirUsuario(nuevoUsuario);
    setUsuario(nuevoUsuario);
  }, []);

  const cerrarSesion = useCallback(async () => {
    await borrarSesionGuardada();
    setUsuario(null);
  }, []);

  const value = useMemo(
    () => ({ usuario, guardarUsuarioActual, cerrarSesion }),
    [usuario, guardarUsuarioActual, cerrarSesion]
  );

  if (cargando || error) {
    return (
      <View style={styles.espera}>
        <Text>{error || 'Cargando sesión...'}</Text>
        {error ? (
          <Pressable onPress={() => {
            setCargando(true);
            setError('');
            setIntento((actual) => actual + 1);
          }} style={styles.reintentar}>
            <Text>Reintentar</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return <SesionContext.Provider value={value}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const contexto = useContext(SesionContext);
  if (contexto === undefined) throw new Error('useSesion debe usarse dentro de SesionProvider.');
  return contexto;
}

const styles = StyleSheet.create({
  espera: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  reintentar: { padding: 12, borderRadius: 8, backgroundColor: '#e1f4df' },
});
