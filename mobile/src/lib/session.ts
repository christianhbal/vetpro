import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'vetpro.currentUser';

export type UsuarioActual = {
  id: number;
  nombre: string;
  email: string;
  telefono?: string | null;
  direccion?: string | null;
};

function esUsuarioActual(value: unknown): value is UsuarioActual {
  if (typeof value !== 'object' || value === null) return false;
  const usuario = value as Record<string, unknown>;
  return (
    typeof usuario.id === 'number' &&
    Number.isInteger(usuario.id) &&
    typeof usuario.nombre === 'string' &&
    typeof usuario.email === 'string' &&
    (usuario.telefono === undefined ||
      usuario.telefono === null ||
      typeof usuario.telefono === 'string') &&
    (usuario.direccion === undefined ||
      usuario.direccion === null ||
      typeof usuario.direccion === 'string')
  );
}

export async function guardarUsuarioActual(usuario: UsuarioActual): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
}

export async function obtenerUsuarioActual(): Promise<UsuarioActual | null> {
  const storedUser = await AsyncStorage.getItem(SESSION_KEY);
  if (!storedUser) return null;

  try {
    const usuario: unknown = JSON.parse(storedUser);
    if (esUsuarioActual(usuario)) {
      return usuario;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }

  await AsyncStorage.removeItem(SESSION_KEY);
  return null;
}

export async function cerrarSesion(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}
