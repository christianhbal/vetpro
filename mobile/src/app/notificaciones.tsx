import { consultarNotificaciones } from '@/lib/notificaciones';
import { useCallback, useState } from 'react';
import { StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { RestablecerPassword, type DestinoRecuperacion } from '@/components/restablecer-password';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import {
  abrirMapa,
  type SedeVeterinaria,
} from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { useSesion } from '@/lib/sesion-context';
import { useSedes } from '@/lib/sede';

// Logo para los avisos globales.
const logoVetPro = require('../../assets/images/vetpro-logo-horizontal.jpg');

type Aviso = {
  id: number;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  turnoId: number | null;
  turno: {
    sede: SedeVeterinaria;
    tipo: string;
    fecha: string;
    hora: string;
  } | null;
  mascota: { nombre: string; foto: string | null } | null;
  motivo: string | null;
  sede: string | null;
  hora: string | null;
  esGlobal?: boolean | null;
  tipo?: string | null;
  solicitanteEmail?: string | null;
};

function esMascotaDelAviso(value: unknown): value is NonNullable<Aviso['mascota']> {
  if (typeof value !== 'object' || value === null) return false;
  const mascota = value as Record<string, unknown>;
  return (
    typeof mascota.nombre === 'string' &&
    (mascota.foto === null || typeof mascota.foto === 'string')
  );
}

function esAviso(value: unknown): value is Aviso {
  if (typeof value !== 'object' || value === null) return false;
  const aviso = value as Record<string, unknown>;
  return (
    typeof aviso.id === 'number' &&
    typeof aviso.title === 'string' &&
    typeof aviso.message === 'string' &&
    (typeof aviso.readAt === 'string' || aviso.readAt === null) &&
    typeof aviso.createdAt === 'string' &&
    (typeof aviso.turnoId === 'number' || aviso.turnoId === null) &&
    (aviso.turno === null || esTurnoDelAviso(aviso.turno)) &&
    (aviso.mascota === null || esMascotaDelAviso(aviso.mascota)) &&
    (typeof aviso.motivo === 'string' || aviso.motivo === null) &&
    (typeof aviso.sede === 'string' || aviso.sede === null || aviso.sede === undefined) &&
    (typeof aviso.hora === 'string' || aviso.hora === null || aviso.hora === undefined) &&
    (typeof aviso.esGlobal === 'boolean' || aviso.esGlobal === null || aviso.esGlobal === undefined) &&
    (aviso.tipo == null || typeof aviso.tipo === 'string') &&
    (aviso.solicitanteEmail == null || typeof aviso.solicitanteEmail === 'string')
  );
}

function esTurnoDelAviso(value: unknown): value is NonNullable<Aviso['turno']> {
  if (typeof value !== 'object' || value === null) return false;
  const turno = value as Record<string, unknown>;
  const mascota = turno.mascota;
  if (typeof mascota !== 'object' || mascota === null) return false;
  return (
    typeof turno.sede === 'string' &&
    typeof turno.tipo === 'string' &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    typeof (mascota as Record<string, unknown>).nombre === 'string' &&
    ((mascota as Record<string, unknown>).foto === null ||
      typeof (mascota as Record<string, unknown>).foto === 'string')
  );
}

function ordenarParaElCliente(avisos: Aviso[]): Aviso[] {
  return [...avisos].sort((a, b) => {
    const sinLeerA = a.readAt === null;
    const sinLeerB = b.readAt === null;
    if (sinLeerA !== sinLeerB) return sinLeerA ? -1 : 1;
    return 0;
  });
}

function fotoDelAviso(aviso: Aviso): string | null {
  const foto = aviso.mascota?.foto;
  return foto && foto.trim() !== '' ? foto : null;
}

function turnoDelAviso(aviso: Aviso): Aviso['turno'] {
  return aviso.turno;
}

/**
 * Texto que se ve en la tarjeta sin apretarla.
 *
 * La tarjeta resume; el detalle se muestra solo en el modal.
 */
function textoDelAviso(aviso: Aviso): string {
  const turno = turnoDelAviso(aviso);
  if (aviso.title !== TITULO_TURNO) return aviso.message;
  if (turno === null) return 'Tocá para ver los detalles de tu turno.';
  return `Turno para ${aviso.mascota?.nombre ?? 'tu mascota'}. Tocá para ver los detalles.`;
}

const TITULO_TURNO = 'Tu turno se acerca';
const TITULO_MODIFICADO = 'Tu turno fue modificado';
const TITULO_CANCELADO = 'Tu turno fue cancelado';

function tipoDeVentana(
  aviso: Aviso
): 'recordatorio' | 'modificado' | 'cancelado' | 'global' | null {
  if (aviso.esGlobal === true) return 'global';
  if (aviso.title === TITULO_TURNO) return 'recordatorio';
  if (aviso.title === TITULO_MODIFICADO) return 'modificado';
  if (aviso.title === TITULO_CANCELADO) return 'cancelado';
  return null;
}

function tituloDeVentana(
  tipo: 'recordatorio' | 'modificado' | 'cancelado' | 'global',
  aviso: Aviso
): string {
  if (tipo === 'modificado') return 'Turno modificado';
  if (tipo === 'cancelado') return 'Turno cancelado';
  if (tipo === 'global') return aviso.title;
  return TITULO_TURNO;
}

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

// Modal de detalle para avisos de turno y generales.
function VentanaAviso({
  aviso,
  onCerrar,
}: {
  aviso: Aviso | null;
  onCerrar: () => void;
}) {
  const { sedes } = useSedes();
  const direccionesSedes = Object.fromEntries(sedes.map((sede) => [sede.nombre, sede.direccion]));
  if (!aviso) return null;
  const tipo = tipoDeVentana(aviso);
  if (tipo === null) return null;

  const turno = turnoDelAviso(aviso);
  const sede = (turno?.sede ?? aviso.sede ?? null) as SedeVeterinaria | null;
  const hora = turno?.hora ?? aviso.hora ?? null;
  const detalleCambios = tipo === 'modificado' ? aviso.message.split(' cambió: ')[1] : undefined;
  const cambios = detalleCambios
    ? detalleCambios.replace(/\.$/, '').split(/, (?=(?:tipo|sede|fecha|hora): )/).map((cambio) => {
        const separador = cambio.indexOf(': ');
        return { campo: cambio.slice(0, separador), valor: cambio.slice(separador + 2) };
      }).filter((cambio) => ['tipo', 'sede', 'fecha', 'hora'].includes(cambio.campo))
    : [];
  const cuerpo =
    tipo === 'recordatorio' && turno
      ? `Turno de ${turno.tipo} para ${aviso.mascota?.nombre ?? 'tu mascota'} el ${turno.fecha.split('-').reverse().join('/')} a las ${turno.hora}.`
      : tipo === 'recordatorio'
        ? 'Este turno ya no está disponible.'
      : tipo === 'modificado' && cambios.length > 0
        ? `El turno de ${aviso.mascota?.nombre ?? 'tu mascota'} cambió:`
      : tipo === 'cancelado'
        ? aviso.motivo ?? aviso.message
        : aviso.message;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.avisoRaiz}>
        <Pressable style={styles.avisoFondo} onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar aviso" />
        <View style={styles.aviso}>
          <Pressable
            style={({ pressed }) => [styles.avisoCerrar, pressed && estilos.buttonPressed]}
            onPress={onCerrar}
            accessibilityRole="button"
            accessibilityLabel="Cerrar aviso"
          >
            <Ionicons name="close" size={22} color="#263b32" />
          </Pressable>

          <Text style={styles.avisoTitulo}>{tituloDeVentana(tipo, aviso)}</Text>
          {/* El cancelado no lleva texto arriba: su motivo va adentro del
              bloque, como la fila de Sede y Direccion. */}
          {tipo !== 'cancelado' ? (
            <Text style={styles.avisoSubtitulo}>{cuerpo}</Text>
          ) : null}

          {(sede && hora && (tipo !== 'recordatorio' || turno !== null)) || (tipo === 'modificado' && cambios.length > 0) ? (
            <View style={styles.avisoDatos}>
              {sede && hora ? <>
              <View style={styles.avisoDato}>
                <Ionicons name="location-outline" size={17} color="#0f3e17" />
                <Text style={styles.avisoDatoTexto}>
                  <Text style={styles.cartelEtiqueta}>Sede: </Text>
                  {cambios.find((cambio) => cambio.campo === 'sede')?.valor ?? sede}
                </Text>
              </View>
              <View style={styles.avisoDato}>
                <Ionicons name="navigate-outline" size={17} color="#0f3e17" />
                <Text style={styles.avisoDatoTexto}>
                  <Text style={styles.cartelEtiqueta}>Dirección: </Text>
                  {direccionesSedes[sede] ?? ''}
                </Text>
              </View>
              <View style={styles.avisoDato}>
                <Ionicons name="time-outline" size={17} color="#0f3e17" />
                <Text style={styles.avisoDatoTexto}>
                  <Text style={styles.cartelEtiqueta}>Hora: </Text>
                  {cambios.find((cambio) => cambio.campo === 'hora')?.valor ?? hora}
                </Text>
              </View>
              </> : null}
              {tipo === 'cancelado' ? (
                <View style={styles.avisoDatoArriba}>
                  <Ionicons name="chatbox-ellipses-outline" size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTextoLargo}>
                    <Text style={styles.cartelEtiqueta}>Descripción: </Text>
                    {cuerpo}
                  </Text>
                </View>
              ) : null}
              {tipo === 'modificado' ? cambios.filter((cambio) => cambio.campo === 'tipo' || cambio.campo === 'fecha' || (!sede || !hora)).map((cambio) => (
                <View style={styles.avisoDato} key={cambio.campo}>
                  <Ionicons name={cambio.campo === 'fecha' ? 'calendar-outline' : 'medical-outline'} size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTexto}>
                    <Text style={styles.cartelEtiqueta}>{cambio.campo.charAt(0).toUpperCase() + cambio.campo.slice(1)}: </Text>
                    {cambio.campo === 'fecha' ? cambio.valor.replace(/\d{4}-\d{2}-\d{2}/g, (fecha) => fecha.split('-').reverse().join('/')) : cambio.valor}
                  </Text>
                </View>
              )) : null}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [estilos.qrBoton, styles.avisoBoton, pressed && estilos.buttonPressed]}
            onPress={() => {
              if (tipo === 'recordatorio' && turno !== null && sede) {
                void abrirMapa(sede, direccionesSedes[sede]);
                return;
              }
              onCerrar();
            }}
            accessibilityRole="button"
            accessibilityLabel={tipo === 'recordatorio' && turno !== null ? 'Ir a la sede' : 'Cerrar el aviso'}
          >
            <Text style={estilos.buttonTextPrimary}>{tipo === 'recordatorio' && turno !== null ? 'Ir' : 'OK'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function NotificacionesScreen() {
  const { usuario: usuarioSesion } = useSesion();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const token = usuarioSesion?.accessToken ?? '';
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const esAdmin = usuarioSesion?.esAdmin === true;
  const [modalNuevo, setModalNuevo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [avisoTurno, setAvisoTurno] = useState<Aviso | null>(null);
  const [solicitudReset, setSolicitudReset] = useState<DestinoRecuperacion | null>(null);

  const cargarAvisos = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) {
      setCargando(true);
      setError('');
    }
    try {
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await consultarNotificaciones(usuario);
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar las notificaciones.');
        setAvisos([]);
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('items' in result) ||
        !Array.isArray(result.items) ||
        !result.items.every(esAviso)
      ) {
        setError('La API devolvió notificaciones con un formato inválido.');
        setAvisos([]);
        return;
      }
      setAvisos(usuario.esAdmin ? result.items : ordenarParaElCliente(result.items));

    } catch (requestError) {
      setError(apiUnreachableMessage(requestError));
      setAvisos([]);
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  }, [usuarioSesion]);

  useFocusEffect(
    useCallback(() => {
      void cargarAvisos();
    }, [cargarAvisos])
  );

  const marcarLeido = async (aviso: Aviso) => {
    if (aviso.readAt) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/notifications/${aviso.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudo marcar la notificación como leída.');
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('readAt' in result) ||
        typeof result.readAt !== 'string'
      ) {
        setError('La API no confirmó que la notificación se marcó como leída.');
        return;
      }
      const readAt = result.readAt;
      setAvisos((actuales) =>
        actuales.map((actual) =>
          actual.id === aviso.id ? { ...actual, readAt } : actual
        )
      );
    } catch (requestError) {
      setError(apiUnreachableMessage(requestError));
    }
  };

  const abreVentana = (aviso: Aviso) =>
    (aviso.esGlobal === true || !esAdmin) && tipoDeVentana(aviso) !== null;

  const abrirNuevo = () => {
    setTitulo('');
    setDescripcion('');
    setErrorForm('');
    setModalNuevo(true);
  };

  const enviarAviso = async () => {
    if (enviandoAviso) return;
    if (!titulo.trim() || !descripcion.trim()) {
      setErrorForm('Completá el título y la descripción del aviso.');
      return;
    }
    if (titulo.trim().length < 4) {
      setErrorForm('El título debe tener al menos 4 caracteres.');
      return;
    }

    setErrorForm('');
    setEnviandoAviso(true);
    try {
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/notifications/global`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${usuario.accessToken}`,
        },
        body: JSON.stringify({ title: titulo.trim(), message: descripcion.trim() }),
      });
      const resultado: unknown = await response.json();
      if (!response.ok) {
        setErrorForm(mensajeApi(resultado) ?? 'No se pudo enviar el aviso a todos los clientes.');
        return;
      }

      setModalNuevo(false);
      setEnviado(titulo.trim());
      setTitulo('');
      setDescripcion('');
      await cargarAvisos(false);
    } catch (requestError) {
      setErrorForm(apiUnreachableMessage(requestError));
    } finally {
      setEnviandoAviso(false);
    }
  };

  return (
    <AppDrawer title="Notificaciones">
      <FlatList
        style={estilos.container}
        data={avisos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.listPadding}
        onRefresh={() => void cargarAvisos()}
        refreshing={cargando}
        ListHeaderComponent={
          <>
            {esAdmin ? (
              <Pressable
                style={({ pressed }) => [styles.nuevoBoton, pressed && estilos.buttonPressed]}
                onPress={abrirNuevo}
                accessibilityRole="button"
                accessibilityLabel="Enviar notificación a todos los clientes"
              >
                <View style={styles.nuevoFila}>
                  <Ionicons name="megaphone-outline" size={20} color="#fffefc" />
                  <Text style={estilos.buttonTextPrimary}>Enviar notificación global</Text>
                </View>
              </Pressable>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.listaVacia}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>{error || 'Todavía no tenés notificaciones.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const conVentana = abreVentana(item);
          const recuperacion = item.tipo === 'recuperacion' || item.tipo === 'recuperacion-resuelta';
          const nombreSolicitante = item.message.replace(/ quiere recuperar su contraseña\.$/, '');
          return (
            <Pressable
              style={({ pressed }) => [
                estilos.cardVertical,
                styles.tarjetaAviso,
                !item.readAt && styles.unread,
                pressed && estilos.buttonPressed,
              ]}
              onPress={() => {
                if (esAdmin && recuperacion && item.solicitanteEmail) {
                  setSolicitudReset({ solicitudId: item.id, nombre: nombreSolicitante, email: item.solicitanteEmail, resuelta: item.tipo === 'recuperacion-resuelta' });
                  void marcarLeido(item);
                  return;
                }
                if (conVentana) setAvisoTurno(item);
                void marcarLeido(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.readAt ? '' : 'No leída. '}${item.title}${conVentana ? '. Ver detalle del aviso' : ''}`}
            >
            <View style={styles.filaAviso}>
              {item.esGlobal || recuperacion ? (
                <Image
                  source={logoVetPro}
                  style={styles.avisoLogo}
                  resizeMode="contain"
                  accessibilityLabel="VetPro, cuidado y bienestar"
                />
              ) : fotoDelAviso(item) ? (
                <Image
                  source={{ uri: fotoDelAviso(item) ?? '' }}
                  style={styles.avisoFoto}
                  resizeMode="contain"
                  accessibilityLabel={`Foto de ${item.mascota?.nombre ?? 'la mascota'}`}
                />
              ) : (
                <Ionicons
                  name={item.readAt ? 'notifications-outline' : 'notifications'}
                  size={22}
                  color="#0f3e17"
                />
              )}
              <View style={styles.contenidoAviso}>
                <Text style={estilos.cardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={estilos.cardSubtitle} numberOfLines={2} ellipsizeMode="tail">
                  {recuperacion ? nombreSolicitante : textoDelAviso(item)}
                </Text>
                {item.tipo === 'recuperacion-resuelta' ? <Text style={styles.date}>Resuelta</Text> : null}
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleDateString('es-AR')}
                </Text>
              </View>
              {!item.readAt ? <View style={styles.unreadDot} /> : null}
              </View>
            </Pressable>
          );
        }}
      />

      <VentanaAviso aviso={avisoTurno} onCerrar={() => setAvisoTurno(null)} />

      {solicitudReset ? (
        <RestablecerPassword
          destino={solicitudReset}
          onCerrar={() => setSolicitudReset(null)}
          onRestablecido={(email) => setAvisos((actuales) => actuales.map((aviso) =>
            aviso.tipo === 'recuperacion' && aviso.solicitanteEmail === email
              ? { ...aviso, tipo: 'recuperacion-resuelta', readAt: aviso.readAt ?? new Date().toISOString() }
              : aviso
          ))}
        />
      ) : null}

      <Modal
        visible={modalNuevo}
        transparent
        animationType="fade"
        onRequestClose={() => setModalNuevo(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setModalNuevo(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
          <View style={estilos.modalCard}>
            <Pressable
              style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
              onPress={() => setModalNuevo(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={24} color="#263b32" />
            </Pressable>

            <Text style={estilos.modalTitle}>Notificación global</Text>
            <Text style={estilos.modalText}>
              El aviso le va a llegar a todos los clientes de la veterinaria.
            </Text>

            <Text style={estilos.formLabel}>Título</Text>
            <TextInput
              style={estilos.formInput}
              placeholder="Ej. Horarios de atención"
              placeholderTextColor="#7a8378"
              value={titulo}
              onChangeText={setTitulo}
              maxLength={60}
              returnKeyType="next"
            />

            <Text style={estilos.formLabel}>Descripción</Text>
            <TextInput
              style={[estilos.formInput, estilos.formInputUltimo]}
              placeholder="Ej. El domingo no atenderemos."
              placeholderTextColor="#7a8378"
              value={descripcion}
              onChangeText={setDescripcion}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={240}
            />

            {errorForm ? (
              <Text style={styles.createError} accessibilityRole="alert">
                {errorForm}
              </Text>
            ) : null}

            <View style={estilos.modalActions}>
              <Pressable
                style={[
                  estilos.modalButton,
                  estilos.modalButtonPrimary,
                  styles.guardarBoton,
                  enviandoAviso && estilos.buttonPressed,
                ]}
                onPress={() => void enviarAviso()}
                disabled={enviandoAviso}
                accessibilityRole="button"
                accessibilityState={{ busy: enviandoAviso }}
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  {enviandoAviso ? 'Enviando...' : 'Enviar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AvisoExito
        visible={enviado !== null}
        titulo="¡Notificación enviada!"
        subtitulo={enviado !== null ? `${enviado} le va a llegar a todos los clientes.` : undefined}
        etiquetaBoton="Cerrar el aviso de notificación enviada"
        onCerrar={() => setEnviado(null)}
      />
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  tarjetaAviso: { height: 120, overflow: 'hidden' },
  cartelEtiqueta: { color: '#0f3e17', fontWeight: '700' },
  avisoRaiz: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  avisoFondo: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(18, 32, 22, 0.55)',
  },
  aviso: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    borderRadius: 20,
    backgroundColor: '#fffefc',
  },
  avisoCerrar: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#eef4ea',
  },
  avisoTitulo: {
    color: '#0f3e17',
    fontSize: 21,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  avisoSubtitulo: {
    marginTop: 6,
    color: '#5c6b60',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  avisoDatos: {
    alignSelf: 'stretch',
    gap: 9,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f1f7ee',
  },
  avisoDato: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avisoDatoArriba: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avisoDatoTexto: { flex: 1, color: '#1e3326', fontSize: 14 },
  avisoDatoTextoLargo: { flex: 1, color: '#1e3326', fontSize: 14, lineHeight: 20 },
  avisoBoton: { alignSelf: 'stretch', marginTop: 18, marginBottom: 0 },
  nuevoBoton: {
    marginBottom: 14,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#0f3e17',
  },
  nuevoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  guardarBoton: {
    flex: 1,
  },
  createError: {
    color: '#a32828',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  unread: {
    borderColor: '#0f3e17',
    borderWidth: 2,
  },
  avisoFoto: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#cfe7d3',
  },
  avisoLogo: {
    width: 58,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#e8f3e4',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#0f3e17',
  },
  date: {
    color: '#555d54',
    fontSize: 12,
    marginTop: 8,
  },
  listaVacia: { padding: 24, alignItems: 'center' },
  filaAviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  contenidoAviso: { flex: 1 },
});
