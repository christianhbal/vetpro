import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  direccionesSedes,
  type SedeVeterinaria,
} from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { obtenerUsuarioActual } from '@/lib/session';

type Aviso = {
  id: number;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

function esAviso(value: unknown): value is Aviso {
  if (typeof value !== 'object' || value === null) return false;
  const aviso = value as Record<string, unknown>;
  return (
    typeof aviso.id === 'number' &&
    typeof aviso.title === 'string' &&
    typeof aviso.message === 'string' &&
    (typeof aviso.readAt === 'string' || aviso.readAt === null) &&
    typeof aviso.createdAt === 'string'
  );
}

// Filtra por fecha de creacion. `createdAt` viene de SQLite con CURRENT_TIMESTAMP
// ("AAAA-MM-DD HH:MM:SS", en UTC) y no como ISO, asi que se reemplaza el espacio
// por una "T" y se le anexa la Z: sin eso Safari y Hermes lo parsean como hora
// local y el filtro correria el dia de cada cliente.
function avisosUltimosDias(avisos: Aviso[], dias: number): Aviso[] {
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  return avisos.filter((aviso) => {
    const fecha = Date.parse(`${aviso.createdAt.replace(' ', 'T')}Z`);
    // Si la fecha no se puede parsear, el aviso se muestra: mejor un aviso de
    // mas que esconder uno sin motivo.
    return !Number.isFinite(fecha) || fecha >= limite;
  });
}

type TurnoApi = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  atendidoEn: string | null;
  mascota: { nombre: string };
};

function esTurnoApi(value: unknown): value is TurnoApi {
  if (typeof value !== 'object' || value === null) return false;
  const turno = value as Record<string, unknown>;
  return (
    typeof turno.id === 'number' &&
    typeof turno.tipo === 'string' &&
    typeof turno.sede === 'string' &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    (turno.atendidoEn === null || typeof turno.atendidoEn === 'string') &&
    typeof (turno.mascota as Record<string, unknown> | undefined)?.nombre === 'string'
  );
}

type ProximoTurno = {
  tipo: string;
  sede: SedeVeterinaria;
  mascota: string;
  minutos: number;
};

/**
 * El turno pendiente que falta menos tiempo.
 *
 * De aca salen el tipo, la mascota y la sede. La notificacion del backend trae
 * todo junto en una frase y parsear esa cadena se rompe en cuanto cambia una
 * palabra.
 */
function proximoTurno(turnos: TurnoApi[], ahora: Date): ProximoTurno | null {
  let mejor: ProximoTurno | null = null;
  for (const turno of turnos) {
    if (turno.atendidoEn !== null) continue;
    const [anio, mes, dia] = turno.fecha.split('-').map(Number);
    const [hh, mm] = turno.hora.split(':').map(Number);
    const cuando = new Date(anio, mes - 1, dia, hh, mm).getTime();
    if (!Number.isFinite(cuando) || cuando <= ahora.getTime()) continue;
    const minutos = Math.round((cuando - ahora.getTime()) / 60000);
    if (mejor === null || minutos < mejor.minutos) {
      mejor = { tipo: turno.tipo, sede: turno.sede, mascota: turno.mascota.nombre, minutos };
    }
  }
  return mejor;
}

/**
 * "Dentro de 30 minutos tenes un turno de Control para mati".
 *
 * Los 30 minutos van fijos: el cartel es un aviso de que hay que arrancar, no
 * una cuenta regresiva. Con la cuenta real (la de 9 horas) el cliente leia un
 * numero que no era el que le servia para decidir.
 */
function textoDelTurno(turno: ProximoTurno): string {
  return `Dentro de 30 minutos tienes un turno de ${turno.tipo} para ${turno.mascota}`;
}

/** Titulo que usa el backend para avisar que el turno esta por empezar. */
const TITULO_TURNO = 'Tu turno se acerca';

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

/**
 * Ventana del turno que se acerca. Es la misma que salta al confirmar un turno,
 * con el fondo tapado: se abre al apretar el cartel de la lista.
 */
function VentanaTurno({
  aviso,
  turno,
  onCerrar,
}: {
  aviso: Aviso | null;
  turno: ProximoTurno | null;
  onCerrar: () => void;
}) {
  if (!aviso) return null;
  const sede = turno?.sede ?? null;
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

          <View style={styles.avisoIcono}>
            <Ionicons name="alarm-outline" size={34} color="#fffefc" />
          </View>

          <Text style={styles.avisoTitulo}>{aviso.title}</Text>
          <Text style={styles.avisoSubtitulo}>
            {turno ? textoDelTurno(turno) : aviso.message}
          </Text>

          {sede ? (
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
                  {direccionesSedes[sede]}
                </Text>
              </View>
            </View>
          ) : null}

          <Pressable
            // Mismo verde y mismo radio que "Escanear QR de llegada": dos
            // botones distintos al lado en la misma pantalla se ven mal.
            style={({ pressed }) => [estilos.qrBoton, styles.avisoBoton, pressed && estilos.buttonPressed]}
            onPress={() => {
              // Sin accion a proposito, igual que el "Ir" del detalle del turno.
            }}
            accessibilityRole="button"
            accessibilityLabel="Ir a la sede"
            accessibilityHint="Todavía no está disponible"
          >
            <Text style={estilos.buttonTextPrimary}>Ir</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function NotificacionesScreen() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errorForm, setErrorForm] = useState('');
  // Titulo del aviso que se acaba de mandar. Es lo unico que necesita el cartel
  // de "enviado": el resto ya esta en la lista de notificaciones.
  const [enviado, setEnviado] = useState<string | null>(null);
  // La ventana que salta sale de la ultima notificacion de "Tu turno se
  // acerca": no hay ningun cartel armado a mano.
  const [avisoTurno, setAvisoTurno] = useState<Aviso | null>(null);
  const [proximo, setProximo] = useState<ProximoTurno | null>(null);

  const cargarAvisos = useCallback(async (mostrarCarga = true) => {
    if (mostrarCarga) {
      setCargando(true);
      setError('');
    }
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      setToken(usuario.accessToken);
      setEsAdmin(usuario.esAdmin);
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${usuario.accessToken}` },
      });
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
      // El usuario normal solo ve los avisos de los ultimos 2 dias. La API
      // devuelve hasta 100 y la base tiene avisos de hace meses, asi que la
      // pantalla aparecia llena de cosas viejas. El admin ve todo, que es quien
      // tiene que revisar el historico.
      setAvisos(usuario.esAdmin ? result.items : avisosUltimosDias(result.items, 2));

      // El admin no tiene turno propio: la ventana con sede y direccion es del
      // cliente.
      if (usuario.esAdmin) {
        setProximo(null);
        return;
      }
      const respuestaTurnos = await fetch(
        `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`,
        { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
      );
      const resultadoTurnos: unknown = await respuestaTurnos.json().catch(() => null);
      setProximo(
        respuestaTurnos.ok && Array.isArray(resultadoTurnos) && resultadoTurnos.every(esTurnoApi)
          ? proximoTurno(resultadoTurnos, new Date())
          : null
      );

    } catch (requestError) {
      setError(apiUnreachableMessage(requestError));
      setAvisos([]);
    } finally {
      if (mostrarCarga) setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarAvisos();
      const intervalo = setInterval(() => {
        void cargarAvisos(false);
      }, 60 * 1000);
      return () => clearInterval(intervalo);
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

  // La ultima de las "Tu turno se acerca": la lista viene de la mas nueva a la
  // mas vieja, asi que es la primera que aparece.
  const ultimoAvisoDeTurno = esAdmin
    ? null
    : avisos.find((aviso) => aviso.title === TITULO_TURNO) ?? null;

  const abrirNuevo = () => {
    setTitulo('');
    setDescripcion('');
    setErrorForm('');
    setModalNuevo(true);
  };

  // No hay reconfirmacion: el admin escribe el aviso y lo manda de una. El
  // backend todavia no expone un POST para crearlo, asi que el cartel de
  // "enviado" es parte de la maqueta.
  const enviarAviso = () => {
    if (!titulo.trim() || !descripcion.trim()) {
      setErrorForm('Completá el título y la descripción del aviso.');
      return;
    }
    if (titulo.trim().length < 4) {
      setErrorForm('El título debe tener al menos 4 caracteres.');
      return;
    }
    setErrorForm('');
    setModalNuevo(false);
    setEnviado(titulo.trim());
    setTitulo('');
    setDescripcion('');
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
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            {cargando ? (
              <ActivityIndicator color="#0f3e17" />
            ) : (
              <Text style={estilos.cardSubtitle}>{error || 'Todavía no tienes notificaciones.'}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              estilos.cardVertical,
              !item.readAt && styles.unread,
              pressed && estilos.buttonPressed,
            ]}
            onPress={() => {
              // La ultima de "Tu turno se acerca" abre la ventana; el resto se
              // marca como leido nomas.
              if (item.id === ultimoAvisoDeTurno?.id) setAvisoTurno(item);
              void marcarLeido(item);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.readAt ? '' : 'No leída. '}${item.title}${item.id === ultimoAvisoDeTurno?.id ? '. Ver aviso del turno' : ''}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Ionicons
                name={item.readAt ? 'notifications-outline' : 'notifications'}
                size={22}
                color="#0f3e17"
              />
              <View style={{ flex: 1 }}>
                <Text style={estilos.cardTitle}>{item.title}</Text>
                <Text style={estilos.cardSubtitle}>{item.message}</Text>
                <Text style={styles.date}>
                  {new Date(item.createdAt).toLocaleDateString('es-AR')}
                </Text>
              </View>
              {!item.readAt ? <View style={styles.unreadDot} /> : null}
            </View>
          </Pressable>
        )}
      />

      <VentanaTurno
        aviso={avisoTurno}
        turno={proximo}
        onCerrar={() => setAvisoTurno(null)}
      />

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
                style={[estilos.modalButton, estilos.modalButtonPrimary, styles.guardarBoton]}
                onPress={enviarAviso}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>Enviar</Text>
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

const styles = {
  cartel: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#0f3e17',
    backgroundColor: '#f1f7ee',
  },
  // Solo la parte de arriba del cartel abre la ventana: el "Ir" de abajo es
  // un boton aparte y no puede quedar adentro de otro boton.
  cartelApertura: { width: '100%' as const },
  cartelEncabezado: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  cartelIcono: {
    width: 34,
    height: 34,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 17,
    backgroundColor: '#e4f1e0',
  },
  cartelTextos: { flex: 1 },
  cartelTitulo: { color: '#0f3e17', fontSize: 17, fontWeight: 'bold' as const },
  cartelCuenta: { marginTop: 1, color: '#556b58', fontSize: 13 },
  cartelMascota: {
    marginTop: 12,
    color: '#0f3e17',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  cartelDetalle: { marginTop: 2, color: '#4a6152', fontSize: 14 },
  cartelSede: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#dfe8db',
    gap: 5,
  },
  cartelSedeFila: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  cartelSedeTexto: { flex: 1, color: '#5c6b60', fontSize: 13 },
  cartelEtiqueta: { color: '#0f3e17', fontWeight: '700' as const },
  cartelBoton: { marginTop: 14, marginBottom: 0 },
  // Ventana del turno, calcada de la de "Turno creado con exito".
  avisoRaiz: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
  },
  avisoFondo: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(18, 32, 22, 0.55)',
  },
  aviso: {
    width: '100%' as const,
    maxWidth: 380,
    alignItems: 'center' as const,
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 20,
    borderRadius: 20,
    backgroundColor: '#fffefc',
  },
  avisoCerrar: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 17,
    backgroundColor: '#eef4ea',
  },
  avisoIcono: {
    width: 68,
    height: 68,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
    borderRadius: 34,
    backgroundColor: '#1f6b33',
  },
  avisoTitulo: {
    color: '#0f3e17',
    fontSize: 21,
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
  },
  avisoSubtitulo: {
    marginTop: 6,
    color: '#5c6b60',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center' as const,
  },
  avisoDatos: {
    alignSelf: 'stretch' as const,
    gap: 9,
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f1f7ee',
  },
  avisoDato: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  avisoDatoTexto: { flex: 1, color: '#1e3326', fontSize: 14 },
  avisoBoton: { alignSelf: 'stretch' as const, marginTop: 18, marginBottom: 0 },
  nuevoBoton: {
    marginBottom: 14,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center' as const,
    backgroundColor: '#0f3e17',
  },
  nuevoFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
};
