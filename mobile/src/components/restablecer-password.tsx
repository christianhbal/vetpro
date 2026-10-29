import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AvisoExito } from './aviso-exito';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { useSesion } from '@/lib/sesion-context';
import { cancelarRecordatorios } from '@/lib/recordatorios';

export type DestinoRecuperacion = {
  nombre: string;
  email: string;
  userId?: number;
  solicitudId?: number;
  resuelta?: boolean;
};

type Props = {
  destino: DestinoRecuperacion;
  onCerrar: () => void;
  onRestablecido?: (email: string) => void;
};

export function RestablecerPassword({ destino, onCerrar, onRestablecido }: Props) {
  const { usuario, cerrarSesion } = useSesion();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<{ password: string; propia: boolean } | null>(null);

  const confirmar = async () => {
    if (guardando || !usuario?.esAdmin || destino.resuelta || resultado) return;
    setGuardando(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usuario.accessToken}` },
        body: JSON.stringify(destino.solicitudId ? { solicitudId: destino.solicitudId } : { userId: destino.userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'No se pudo restablecer la contraseña.');
      if (!Number.isInteger(data.id) || typeof data.password !== 'string') throw new Error('La API devolvió una respuesta inválida.');
      setResultado({ password: data.password, propia: data.id === usuario.id });
      onRestablecido?.(destino.email);
    } catch (error) {
      setError(error instanceof TypeError ? apiUnreachableMessage(error) : error instanceof Error ? error.message : 'No se pudo restablecer la contraseña.');
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = async () => {
    if (guardando) return;
    if (resultado?.propia) {
      setGuardando(true);
      try {
        await cancelarRecordatorios();
        await cerrarSesion();
        router.replace('/');
      } catch {
        setError('La contraseña ya cambió, pero no se pudo cerrar la sesión. Tocá Listo para reintentar.');
        setGuardando(false);
        return;
      }
    }
    onCerrar();
  };

  if (resultado) return (
    <AvisoExito visible titulo="¡Contraseña restablecida!" subtitulo={resultado.propia ? 'Guardá la contraseña. Al aceptar, volverás al inicio de sesión.' : `Compartí esta contraseña con ${destino.nombre}. Puede cambiarla desde Perfil.`} etiquetaBoton="Aceptar contraseña generada" onCerrar={() => void cerrar()}>
      <Text style={styles.password} selectable>{resultado.password}</Text>
      {error ? <Text style={estilos.formError} accessibilityRole="alert">{error}</Text> : null}
    </AvisoExito>
  );

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => void cerrar()}>
      <View style={estilos.petModalRoot}>
        <Pressable style={estilos.petModalBackdrop} onPress={() => void cerrar()} disabled={guardando} accessibilityRole="button" accessibilityLabel="Cerrar recuperación" />
        <View style={estilos.modalCard}>
          <Text style={estilos.modalTitle}>{destino.resuelta ? 'Solicitud resuelta' : '¿Restablecer contraseña?'}</Text>
          <Text style={estilos.modalText}>{destino.nombre}{'\n'}{destino.email}</Text>
          <Text style={estilos.modalText}>{destino.resuelta ? 'Esta solicitud ya fue cerrada y no puede volver a ejecutarse.' : 'Se cambiará la contraseña por el apellido seguido de 12345. La contraseña anterior dejará de funcionar.'}</Text>
          {error ? <Text style={estilos.formError} accessibilityRole="alert">{error}</Text> : null}
          <View style={estilos.modalActions}>
            <Pressable style={[estilos.modalButton, estilos.modalButtonNeutral]} onPress={() => void cerrar()} disabled={guardando} accessibilityRole="button">
              <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>{destino.resuelta ? 'Cerrar' : 'Cancelar'}</Text>
            </Pressable>
            {!destino.resuelta ? (
              <Pressable style={[estilos.modalButton, estilos.modalButtonPrimary]} onPress={() => void confirmar()} disabled={guardando} accessibilityRole="button" accessibilityState={{ busy: guardando }}>
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>{guardando ? 'Restableciendo...' : 'Restablecer'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  password: { fontSize: 22, fontWeight: 'bold', color: '#0f3e17', marginTop: 16, textAlign: 'center' },
});
