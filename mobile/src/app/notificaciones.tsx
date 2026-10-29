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
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import {
  type SedeVeterinaria,
} from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { useSesion } from '@/lib/sesion-context';
import { useSedes } from '@/lib/sede';

/**
 * Logo de VetPro para los avisos globales.
 *
 * Va como asset local y no como data URI de la base: es la misma imagen que
 * usan el login y el menu, asi que no hay dos copias que puedan quedar
 * desactualizadas.
 */
const logoVetPro = require('../../assets/images/vetpro-logo-horizontal.jpg');

type Aviso = {
  id: number;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  /** Turno al que apunta el aviso. Lo usan los recordatorios de proximidad. */
  turnoId: number | null;
  /**
   * El turno con su sede, tipo y mascota. Viene en la respuesta de la API.
   *
   * Hace falta porque el aviso de "Tu turno se acerca" tiene que mostrar la
   * direccion de ESE turno, no la del proximo turno pendiente del usuario: son
   * cosas distintas y antes se confundian.
   */
  turno: {
    sede: SedeVeterinaria;
    tipo: string;
    fecha: string;
    hora: string;
  } | null;
  /** Mascota del aviso. Viene siempre, tenga o no turno asociado. */
  mascota: { nombre: string; foto: string | null } | null;
  /**
   * Por que se cancelo, en palabras.
   *
   * Va aparte del `message` porque el mensaje es la linea corta de la lista y
   * el motivo es lo largo que se lee al apretar el aviso de cancelado.
   */
  motivo: string | null;
  /**
   * Sede y hora del turno cancelado.
   *
   * Vienen copiadas en el aviso y no dentro de `turno` porque al cancelar el
   * turno se borra y la relacion queda en null. Sin estas dos, la ventana del
   * aviso de cancelado no podria decir de que sede era el turno que se cayo.
   */
  sede: string | null;
  hora: string | null;
  /**
   * Aviso general de la veterinaria ("feriado", "nos mudamos"), no de un turno
   * ni de una mascota. La tarjeta lleva el logo de VetPro en vez de la foto del
   * paciente, porque no hay ninguno.
   */
  esGlobal?: boolean | null;
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
    (typeof aviso.esGlobal === 'boolean' || aviso.esGlobal === null || aviso.esGlobal === undefined)
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

/**
 * Foto de la mascota del aviso.
 *
 * Viene como data URI desde la API: hay formatos (AVIF) que el empaquetador de
 * la app no sabe leer, asi que no se pueden traer como archivo.
 */
function fotoDelAviso(aviso: Aviso): string | null {
  const foto = aviso.mascota?.foto;
  return foto && foto.trim() !== '' ? foto : null;
}

/** El turno del aviso, si la API lo trajo. */
function turnoDelAviso(aviso: Aviso): Aviso['turno'] {
  return aviso.turno;
}

/**
 * Texto que se ve en la tarjeta sin apretarla.
 *
 * El de "Tu turno se acerca" no se usa el mensaje de la API (que termina con la
 * direccion entre parentesis y queda cortado en dos lineas): se arma con el turno
 * y para en la sede. La direccion, la hora y el boton "Ir" van solo en la
 * ventana, que es donde esta lo que hay que hacer para llegar.
 */
function textoDelAviso(aviso: Aviso): string {
  const turno = turnoDelAviso(aviso);
  if (aviso.title !== TITULO_TURNO || turno === null) return aviso.message;
  return `Turno de ${turno.tipo} para ${aviso.mascota?.nombre ?? 'tu mascota'} en ${turno.sede}, ${turno.fecha.split('-').reverse().join('/')} a las ${turno.hora}.`;
}

/** Titulos que usa el backend. Cada uno abre su propia ventana. */
const TITULO_TURNO = 'Tu turno se acerca';
const TITULO_MODIFICADO = 'Tu turno fue modificado';
const TITULO_CANCELADO = 'Tu turno fue cancelado';

/**
 * Que ventana corresponde a cada aviso.
 *
 * Los tres de turno miran el titulo porque cada uno tiene su formato. El global
 * se decide por el campo `esGlobal` y no por el titulo: el titulo lo escribe la
 * veterinaria (hoy "Feriado") y puede ser el que sea.
 */
function tipoDeVentana(
  aviso: Aviso
): 'recordatorio' | 'modificado' | 'cancelado' | 'global' | null {
  if (aviso.esGlobal === true) return 'global';
  if (aviso.title === TITULO_TURNO && turnoDelAviso(aviso) !== null) return 'recordatorio';
  if (aviso.title === TITULO_MODIFICADO) return 'modificado';
  if (aviso.title === TITULO_CANCELADO) return 'cancelado';
  return null;
}

/**
 * Titulo de la ventana. El de los avisos de turno es largo y con "Tu turno" de
 * mas, asi que se recorta. El global va tal cual lo escribio la veterinaria.
 */
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

/**
 * Ventana del aviso. Es la misma que salta al confirmar un turno, con el fondo
 * tapado: se abre al apretar el cartel de la lista.
 *
 * La comparten los cuatro avisos que tienen algo que contar:
 *  - recordatorio: que viene el turno, con la sede a la que ir y boton "Ir".
 *  - modificado: que cambio y donde quedo el turno, con boton "OK".
 *  - cancelado: por que se caio, mas los datos del turno que se perdio. No hay
 *    turno (el backend lo borro), asi que la sede y la hora salen de los campos
 *    copiados en el aviso. El boton es "OK": al turno ya no se va.
 *  - global: el aviso general de la veterinaria (feriado, cierre). Va con el
 *    titulo y la descripcion tal cual se escribieron, sin datos de sede.
 *
 * Solo el recordatorio tiene "Ir": es el unico aviso donde hay algo adonde ir.
 * En los otros tres el boton cierra la ventana, asi que dice "OK".
 */
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
  // Del turno si esta vivo; si ya se cancelo y borro, de los campos copiados en
  // el aviso. Asi el cancelado muestra la misma sede, direccion y hora que el
  // modificado y no queda como un aviso sin datos.
  const sede = (turno?.sede ?? aviso.sede ?? null) as SedeVeterinaria | null;
  const hora = turno?.hora ?? aviso.hora ?? null;
  const cuerpo =
    tipo === 'recordatorio' && turno
      ? `Turno de ${turno.tipo} para ${aviso.mascota?.nombre ?? 'tu mascota'} el ${turno.fecha.split('-').reverse().join('/')} a las ${turno.hora}.`
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

          {/* El bloque sale entero si hay sede y hora, salgan del turno vivo o de los
              campos copiados en el aviso cuando el turno ya se borro al
              cancelar. Sin sede no hay nada que mostrar. */}
          {sede && hora ? (
            <View style={styles.avisoDatos}>
              <View style={styles.avisoDato}>
                <Ionicons name="location-outline" size={17} color="#0f3e17" />
                <Text style={styles.avisoDatoTexto}>
                  <Text style={styles.cartelEtiqueta}>Sede: </Text>
                  {sede}
                </Text>
              </View>
              <View style={styles.avisoDato}>
                <Ionicons name="navigate-outline" size={17} color="#0f3e17" />
                <Text style={styles.avisoDatoTexto}>
                  <Text style={styles.cartelEtiqueta}>Dirección: </Text>
                  {direccionesSedes[sede] ?? ''}
                </Text>
              </View>
              {/* La hora va debajo de la dirección y no en el texto de arriba:
                  el subtítulo dice cuanto falta, no a que hora hay que estar. */}
              <View style={styles.avisoDato}>
                <Ionicons name="time-outline" size={17} color="#0f3e17" />
                <Text style={styles.avisoDatoTexto}>
                  <Text style={styles.cartelEtiqueta}>Hora: </Text>
                  {hora}
                </Text>
              </View>
              {/* La descripcion va ULTIMA, con la misma etiqueta que Sede,
                  Direccion y Hora: es un dato mas del aviso. Afuera del bloque
                  quedaba flotando sola pegada al borde, y arriba de todo
                  partia el bloque en dos y rompia el renglon de las filas cortas. */}
              {tipo === 'cancelado' ? (
                <View style={styles.avisoDatoArriba}>
                  {/* Un bocadillo y no un documento: el motivo es lo que dijo la veterinaria,
                  no un texto para leer. Con document-text-outline parecia una
                  hoja de informe pegada en el medio de los datos. */}
                  <Ionicons name="chatbox-ellipses-outline" size={17} color="#0f3e17" />
                  <Text style={styles.avisoDatoTextoLargo}>
                    <Text style={styles.cartelEtiqueta}>Descripción: </Text>
                    {cuerpo}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Pressable
            // Mismo verde y mismo radio que "Escanear QR de llegada": dos
            // botones distintos al lado en la misma pantalla se ven mal.
            style={({ pressed }) => [estilos.qrBoton, styles.avisoBoton, pressed && estilos.buttonPressed]}
            onPress={onCerrar}
            accessibilityRole="button"
            accessibilityLabel={tipo === 'recordatorio' ? 'Ir a la sede' : 'Cerrar el aviso'}
          >
            <Text style={estilos.buttonTextPrimary}>{tipo === 'recordatorio' ? 'Ir' : 'OK'}</Text>
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
  // Va mandando el aviso: el boton queda deshabilitado para que no se envien
  // dos veces con un doble toque.
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  // Titulo del aviso que se acaba de mandar. Es lo unico que necesita el cartel
  // de "enviado": el resto ya esta en la lista de notificaciones.
  const [enviado, setEnviado] = useState<string | null>(null);
  // La ventana que salta sale de la ultima notificacion de "Tu turno se
  // acerca": no hay ningun cartel armado a mano.
  const [avisoTurno, setAvisoTurno] = useState<Aviso | null>(null);

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

  // Abre la ventana el aviso de turno que trae, modificado o cancelado, y
  // tambien el aviso global de la veterinaria.
  //
  // El global la abre cualquiera, admin incluido: el es el que lo escribio y no
  // hay a donde ir con el, asi que no hay motivo para cerrarle la ventana. Los
  // de turno son del cliente (el "Ir" va a la sede) y el admin solo los revisa
  // en la lista.
  const abreVentana = (aviso: Aviso) =>
    (aviso.esGlobal === true || !esAdmin) && tipoDeVentana(aviso) !== null;

  const abrirNuevo = () => {
    setTitulo('');
    setDescripcion('');
    setErrorForm('');
    setModalNuevo(true);
  };

  // El admin escribe el aviso y lo manda de una, sin reconfirmacion: el cartel
  // de "enviado" se arma recien cuando la API confirma que quedo guardado.
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
      // La lista se recarga recien: el aviso recien creado tiene que aparecer en
      // el propio listado del admin, no solo en el cartel de "enviado".
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
              <Text style={estilos.cardSubtitle}>{error || 'Todavía no tienes notificaciones.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const conVentana = abreVentana(item);
          return (
            <Pressable
              style={({ pressed }) => [
                estilos.cardVertical,
                !item.readAt && styles.unread,
                pressed && estilos.buttonPressed,
              ]}
              onPress={() => {
                // Los avisos de proximidad abren la ventana; el resto se marca
                // como leido nomas.
                if (conVentana) setAvisoTurno(item);
                void marcarLeido(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.readAt ? '' : 'No leída. '}${item.title}${conVentana ? '. Ver detalle del aviso' : ''}`}
            >
            <View style={styles.filaAviso}>
              {item.esGlobal ? (
                // El aviso global no es de una mascota, asi que va el logo. Con
                // "contain" y un fondo claro el logo horizontal se lee entero
                // en el cuadrado en vez de quedar con los bordes cortados.
                <Image
                  source={logoVetPro}
                  style={styles.avisoLogo}
                  resizeMode="contain"
                  accessibilityLabel="VetPro, cuidado y bienestar"
                />
              ) : fotoDelAviso(item) ? (
                // La foto de la mascota: con la campanita todas las tarjetas se
                // veian iguales y no se podia saber de quien era el turno.
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
                <Text style={estilos.cardTitle}>{item.title}</Text>
                <Text style={estilos.cardSubtitle}>{textoDelAviso(item)}</Text>
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
  cartelEtiqueta: { color: '#0f3e17', fontWeight: '700' },
  // Ventana del turno, calcada de la de "Turno creado con exito".
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
  // La fila de "Descripcion" es la unica que ocupa varias lineas: el icono va
  // arriba, pegado a la primera, y no al medio de todo el texto.
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
  // El logo es horizontal: necesita un poco mas de lado y aire alrededor para
  // que la palabra "VetPro" entre completa.
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
  listaVacia: { paddingVertical: 20, alignItems: 'center' },
  filaAviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  contenidoAviso: { flex: 1 },
});
