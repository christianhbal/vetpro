import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DimensionValue } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  descripcionEspecieMascota,
  formatearFechaTurno,
  sedesVeterinaria,
  turnoSiguePendiente,
  type SedeVeterinaria,
  type TurnoGuardado,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import QRCode from 'react-native-qrcode-svg';
import { CHECK_IN_QR } from '@/lib/check-in';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  edad: number | null;
  foto: string | null;
};

type CitaLista = {
  id: number;
  key: string;
  mascota: string;
  motivo: string;
  fecha: string;
  dueno: string | null;
  descripcion: string | null;
  guardado: TurnoGuardado;
};

// Turnos de ejemplo que se muestran al admin en "Proximas citas". Son datos
// fijos, no vienen de la API: son solo para el primer sprint
type TurnoEjemplo = {
  dueno: string;
  nombre: string;
  especie: string;
  raza: string | null;
  motivo: string;
  descripcion: string | null;
  hora: string;
  diasDesdeHoy: number;
};

const turnosEjemplo: TurnoEjemplo[] = [
  {
    dueno: 'Ana Gómez',
    nombre: 'Lola',
    especie: 'Perro',
    raza: 'Golden',
    motivo: 'Vacunas',
    descripcion: 'Vacunación anual y control de peso.',
    hora: '09:30',
    diasDesdeHoy: 1,
  },
  {
    dueno: 'Bruno Díaz',
    nombre: 'Mora',
    especie: 'Gato',
    raza: null,
    motivo: 'Control de rutina',
    descripcion: null,
    hora: '11:00',
    diasDesdeHoy: 2,
  },
  {
    dueno: 'Carla Ruiz',
    nombre: 'Tito',
    especie: 'Perro',
    raza: 'Pug',
    motivo: 'Desparasitación',
    descripcion: 'Desparasitante interno y externo.',
    hora: '16:30',
    diasDesdeHoy: 3,
  },
];

function fechaDeEjemplo(diasDesdeHoy: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

function citasDeEjemplo(sede: SedeVeterinaria): CitaLista[] {
  return turnosEjemplo.map((ejemplo, indice) => {
    const fecha = fechaDeEjemplo(ejemplo.diasDesdeHoy);
    return {
      id: -1000 - indice,
      key: `ejemplo-${indice}`,
      mascota: ejemplo.nombre,
      motivo: ejemplo.motivo,
      fecha: formatearFechaTurno(fecha, ejemplo.hora),
      dueno: ejemplo.dueno,
      descripcion: ejemplo.descripcion,
      guardado: {
        id: -1000 - indice,
        tipo: ejemplo.motivo,
        sede,
        fecha,
        hora: ejemplo.hora,
        llegadaEn: null,
        descripcion: ejemplo.descripcion,
        mascotaId: -1000 - indice,
        mascota: {
          id: -1000 - indice,
          nombre: ejemplo.nombre,
          especie: ejemplo.especie,
          raza: ejemplo.raza,
          foto: null,
        },
      },
    };
  });
}

// Los accesos rapidos son los mismos para todos. El admin entra a Turnos y
// desde ahi, con el boton de abajo, pasa a "Atender pacientes".
const accesosRapidos = [
  { label: 'Turnos', href: '/turnos', icon: 'calendar-outline' },
  { label: 'Mascotas', href: '/mascotas', icon: 'paw-outline' },
  { label: 'Notificaciones', href: '/notificaciones', icon: 'notifications-outline' },
  { label: 'Historial', href: '/historial', icon: 'time-outline' },
] as const;

export default function InicioScreen() {
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargandoMascotas, setCargandoMascotas] = useState(true);
  const [errorMascotas, setErrorMascotas] = useState('');
  const [turnosGuardados, setTurnosGuardados] = useState<TurnoGuardado[]>([]);
  const [cargandoTurnos, setCargandoTurnos] = useState(true);
  const [errorTurnos, setErrorTurnos] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [modalQr, setModalQr] = useState(false);
  const [sedeSeleccionada, setSedeSeleccionada] = useState<SedeVeterinaria>('Recoleta');

  const opcionesSede: OpcionSelector[] = sedesVeterinaria.map((nombre) => ({
    valor: nombre,
    titulo: nombre,
  }));

  const sedeSeleccionadaOpcion =
    opcionesSede.find((opcion) => opcion.valor === sedeSeleccionada) ?? null;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const fotoModalSize = Math.max(
    0,
    Math.min(windowWidth * 0.82, windowHeight - 200, 640)
  );

  const cargarMascotas = useCallback(async () => {
    setCargandoMascotas(true);
    setMascotas([]);
    setErrorMascotas('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      setEsAdmin(usuario.esAdmin);
      setNombreUsuario(usuario.nombre.split(' ')[0]);
      setNombreCompleto(usuario.nombre);

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado = await response.json();
      if (!response.ok) {
        setErrorMascotas(resultado.message ?? 'No se pudieron cargar tus mascotas.');
        return;
      }
      setMascotas(resultado);
    } catch (error) {
      setErrorMascotas(apiUnreachableMessage(error));
    } finally {
      setCargandoMascotas(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const cargarTurnos = useCallback(async () => {
    setCargandoTurnos(true);
    setErrorTurnos('');
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`
      );
      const resultado = await response.json();
      if (!response.ok) {
        setErrorTurnos(resultado.message ?? 'No se pudieron cargar tus turnos.');
        setTurnosGuardados([]);
        return;
      }
      setTurnosGuardados(resultado);
    } catch (error) {
      setErrorTurnos(apiUnreachableMessage(error));
      setTurnosGuardados([]);
    } finally {
      setCargandoTurnos(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
    }, [cargarTurnos])
  );

  const ahora = new Date();
  const citasVisibles: CitaLista[] = [
    // El admin ve primero los 3 turnos de ejemplo, y despues los reales de la sede.
    ...(esAdmin ? citasDeEjemplo(sedeSeleccionada) : []),
    ...turnosGuardados
      // El admin filtra por la sede que eligio arriba.
      .filter((turno) => turnoSiguePendiente(turno, ahora))
      .filter((turno) => !esAdmin || turno.sede === sedeSeleccionada)
      .map((turno) => ({
      id: -turno.id,
      key: `guardado-${turno.id}`,
      mascota: turno.mascota.nombre,
      motivo: turno.tipo,
      fecha: formatearFechaTurno(turno.fecha, turno.hora),
      dueno: nombreCompleto || null,
      descripcion: turno.descripcion ?? null,
      guardado: turno,
      })),
  ];

  const renderMascota = ({ item }: { item: Mascota }) => (
    <Pressable
      style={({ pressed }) => [estilos.cardHorizontal, pressed && estilos.buttonPressed]}
      onPress={() => setMascotaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver foto de ${item.nombre}`}
    >
      {item.foto ? (
        <Image
          source={{ uri: item.foto }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            marginBottom: 8,
            backgroundColor: '#cfe7d3',
          }}
          resizeMode="contain"
          accessibilityLabel={`Vista previa de ${item.nombre}`}
        />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            marginBottom: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#cfe7d3',
          }}
        >
          <Ionicons name="paw-outline" size={28} color="#0f3e17" />
        </View>
      )}
      <Text style={estilos.cardTitle}>{item.nombre}</Text>
      <Text style={estilos.cardSubtitle}>
        {descripcionEspecieMascota(item.especie, item.raza)}
      </Text>
    </Pressable>
  );

  const renderCita = ({ item }: { item: CitaLista }) => (
    <Pressable
      style={({ pressed }) => [estilos.cardVertical, pressed && estilos.buttonPressed]}
      onPress={() => setCitaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${item.mascota}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {item.guardado.mascota.foto ? (
          <Image
            source={{ uri: item.guardado.mascota.foto }}
            style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#cfe7d3' }}
            resizeMode="contain"
            accessibilityLabel={`Foto de ${item.mascota}`}
          />
        ) : (
          <View style={styles.turnPhotoPlaceholder}>
            <Ionicons name="paw-outline" size={26} color="#0f3e17" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={estilos.cardTitle}>
            {item.mascota} - {item.motivo}
          </Text>
          <Text style={estilos.cardSubtitle}>{item.fecha}</Text>
          <Text style={estilos.cardSubtitle}>Sede: {item.guardado.sede}</Text>
        </View>
      </View>
    </Pressable>
  );

  const accesos = esAdmin
    ? accesosRapidos.filter((acceso) => acceso.href !== '/mascotas')
    : accesosRapidos;

  return (
    <AppDrawer title="VetPro">
      <FlatList
        style={estilos.container}
        data={citasVisibles}
        keyExtractor={(item) => item.key}
        renderItem={renderCita}
        contentContainerStyle={estilos.listPadding}
        ListEmptyComponent={
          !cargandoTurnos && !errorTurnos ? (
            <Text style={[estilos.cardSubtitle, { paddingHorizontal: 8, paddingBottom: 16 }]}>
              No tienes próximas citas.
            </Text>
          ) : null
        }
        ListHeaderComponent={
          <View>
            <View style={styles.saludo}>
              <Text style={styles.saludoTexto}>¡Hola, {nombreUsuario}!</Text>
            </View>

            <View style={styles.accesos}>
              {accesos.map((acceso) => (
                <Pressable
                  key={acceso.href}
                  style={({ pressed }) => [styles.acceso, pressed && estilos.buttonPressed]}
                  onPress={() => router.push(acceso.href)}
                  accessibilityRole="link"
                  accessibilityLabel={`Ir a ${acceso.label}`}
                >
                  <View style={styles.accesoIcono}>
                    <Ionicons name={acceso.icon} size={20} color="#0f3e17" />
                  </View>
                  <Text style={styles.accesoTexto} numberOfLines={2}>
                    {acceso.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {esAdmin ? (
              <View style={styles.bloqueSede}>
                <SelectorCampo
                  label="Sede"
                  icono="location-outline"
                  placeholder="Elegí una sede"
                  opciones={opcionesSede}
                  seleccion={sedeSeleccionadaOpcion}
                  onSelect={(opcion) => setSedeSeleccionada(opcion.valor as SedeVeterinaria)}
                  compacto
                  accessibilityLabel="Elegir sede de la veterinaria"
                />
              </View>
            ) : null}

            {esAdmin ? null : (
              <>
                <Text style={estilos.sectionTitle}>Tus Mascotas</Text>
                <FlatList
                  horizontal
                  data={mascotas}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderMascota}
                  showsHorizontalScrollIndicator={false}
                  style={estilos.horizontalList}
                  contentContainerStyle={estilos.horizontalListContent}
                  ListEmptyComponent={
                    <View style={styles.mascotasVacias}>
                      {cargandoMascotas ? (
                        <ActivityIndicator color="#0f3e17" />
                      ) : (
                        <Text style={estilos.cardSubtitle}>
                          {errorMascotas || 'Todavía no tienes mascotas registradas.'}
                        </Text>
                      )}
                    </View>
                  }
                />
              </>
            )}
            {esAdmin ? (
              <View style={styles.qrAdminBloque}>
                <Pressable
                  style={({ pressed }) => [estilos.qrBoton, pressed && estilos.buttonPressed]}
                  onPress={() => setModalQr(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mostrar el código QR de llegada de ${sedeSeleccionada}`}
                >
                  <View style={estilos.qrBotonFila}>
                    <Ionicons name="qr-code-outline" size={20} color="#fffefc" />
                    <Text style={estilos.buttonTextPrimary}>QR de llegada</Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <Link href="/escanear-qr" asChild>
                <Pressable
                  style={estilos.qrBoton}
                  accessibilityRole="link"
                  accessibilityLabel="Escanear código QR de la veterinaria"
                >
                  <View style={estilos.qrBotonFila}>
                    <Ionicons name="qr-code-outline" size={20} color="#fffefc" />
                    <Text style={estilos.buttonTextPrimary}>Escanear QR en la veterinaria</Text>
                  </View>
                </Pressable>
              </Link>
            )}

            <Text style={estilos.sectionTitle}>Próximas Citas</Text>
            {cargandoTurnos ? (
              <ActivityIndicator color="#0f3e17" style={{ marginBottom: 12 }} />
            ) : errorTurnos ? (
              <Text style={[estilos.cardSubtitle, { marginBottom: 12 }]}>{errorTurnos}</Text>
            ) : null}
          </View>
        }
        />

      <Modal
        visible={mascotaSeleccionada !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setMascotaSeleccionada(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setMascotaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
          />
          {mascotaSeleccionada && (
            <View style={estilos.petPhotoCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setMascotaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar foto"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
              {mascotaSeleccionada.foto ? (
                <Image
                  source={{ uri: mascotaSeleccionada.foto }}
                  style={[estilos.petPhoto, { width: fotoModalSize, height: fotoModalSize }]}
                  resizeMode="contain"
                  accessibilityLabel={`Foto de ${mascotaSeleccionada.nombre}`}
                />
              ) : (
                <Ionicons name="paw-outline" size={88} color="#69806a" />
              )}
              <Text style={estilos.cardTitle}>{mascotaSeleccionada.nombre}</Text>
              <Text style={estilos.cardSubtitle}>
                {[
                  descripcionEspecieMascota(
                    mascotaSeleccionada.especie,
                    mascotaSeleccionada.raza
                  ),
                  mascotaSeleccionada.edad !== null
                    ? `${mascotaSeleccionada.edad} años`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={citaSeleccionada !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setCitaSeleccionada(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setCitaSeleccionada(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar detalle"
          />
          {citaSeleccionada && (
            <View style={estilos.modalCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setCitaSeleccionada(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar detalle"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>

              <Text style={estilos.modalTitle}>{citaSeleccionada.mascota}</Text>
              <Text style={estilos.modalText}>Motivo: {citaSeleccionada.motivo}</Text>
              <Text style={estilos.modalText}>
                Fecha:{' '}
                {new Date(`${citaSeleccionada.guardado.fecha}T12:00:00`).toLocaleDateString(
                  'es-AR',
                  { weekday: 'long', day: 'numeric', month: 'long' }
                )}
              </Text>
              <Text style={estilos.modalText}>Hora: {citaSeleccionada.guardado.hora}</Text>
              <Text style={estilos.modalText}>Sede: {citaSeleccionada.guardado.sede}</Text>
              {citaSeleccionada.dueno ? (
                <Text style={estilos.modalText}>Dueño: {citaSeleccionada.dueno}</Text>
              ) : null}
              {citaSeleccionada.descripcion ? (
                <Text style={estilos.modalText}>
                  Descripción: {citaSeleccionada.descripcion}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={modalQr}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setModalQr(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setModalQr(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar código QR"
          />
          <View style={estilos.modalCard}>
            <Pressable
              style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
              onPress={() => setModalQr(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar código QR"
            >
              <Ionicons name="close" size={24} color="#263b32" />
            </Pressable>

            <Text style={[estilos.modalTitle, styles.qrAdminTitulo]}>Código QR de llegada</Text>
            <Text style={[estilos.modalText, styles.qrAdminTexto]}>
              Presentá este código para que los usuarios registren su llegada.
            </Text>

            <View style={styles.qrAdminMarco}>
              <View style={styles.qrAdminSvg}>
                <QRCode value={CHECK_IN_QR} size={220} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  saludo: {
    width: '100%' as DimensionValue,
    alignItems: 'center' as const,
    paddingTop: 12,
    paddingBottom: 22,
  },
  saludoTexto: {
    alignSelf: 'stretch' as const,
    color: '#0f3e17',
    fontSize: 32,
    fontWeight: 'bold' as const,
    marginBottom: 6,
    textAlign: 'center' as const,
  },
  accesos: {
    width: '100%' as DimensionValue,
    flexDirection: 'row' as const,
    gap: 10,
    marginBottom: 0,
  },
  // Un poco mas abajo de los accesos rapidos y mas cerca del boton del QR.
  bloqueSede: { marginTop: 18, marginBottom: 10 },
  acceso: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 16,
    backgroundColor: '#f2f9f1',
  },
  accesoIcono: {
    width: 42,
    height: 42,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 14,
    backgroundColor: '#e4f1e0',
  },
  accesoTexto: {
    color: '#1e3326',
    fontSize: 12,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  mascotasVacias: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  qrAdminBloque: {
    marginVertical: 12,
  },
  // estilos.modalTitle no tiene textAlign, asi que el titulo se pegaba a la
  // izquierda mientras el subtitizado de abajo si iba centrado.
  qrAdminTitulo: {
    textAlign: 'center' as const,
  },
  qrAdminTexto: {
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  // El SVG de react-native-qrcode-svg mide su propio ancho, y eso descuadra el
  // centrado. Lo meto en una caja cuadrada de tamano fijo: el SVG tiene asi
  // un contenedor con medidas Certain, y el centro es geometrico.
  qrAdminMarco: {
    alignSelf: 'stretch' as const,
    width: '100%' as DimensionValue,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  qrAdminSvg: {
    width: 220,
    height: 220,
    alignSelf: 'center' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  turnPhotoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 10,
    backgroundColor: '#cfe7d3',
  },
};