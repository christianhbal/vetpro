import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { toString } from 'qrcode';
import type { DimensionValue, ImageSourcePropType } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  descripcionEspecieMascota,
  sedesVeterinaria,
  turnoSiguePendiente,
  type SedeVeterinaria,
  type TurnoGuardado,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import QRCode from 'react-native-qrcode-svg';
import { checkInDeSede } from '@/lib/check-in';

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
  /** Foto local, para cuando no hay ninguna que venga de la API. */
  fotoLocal?: ImageSourcePropType | null;
  /** Foto que llega de la API como data URI. */
  fotoUri?: string | null;
  guardado: TurnoGuardado;
};

// Foto de respaldo si el backend no devuelve fotos: en la base puede haber
// formatos (AVIF) que el empaquetador no acepta, asi que llegan por la API.
const fotoRespaldo = require('@/assets/images/mascota-demo.jpg') as ImageSourcePropType;

// Las 4 citas de la portada son fijas: no vienen de la API y no se mueven con
// la fecha. Sirven para tener siempre algo que mostrar mientras la agenda real
// no este conectada.
type CitaEjemplo = {
  dueno: string;
  nombre: string;
  especie: string;
  raza: string | null;
  motivo: string;
  hora: string;
};

const citasEjemploDelDia: CitaEjemplo[] = [
  {
    dueno: 'Ana Gómez',
    nombre: 'Lola',
    especie: 'Perro',
    raza: 'Golden',
    motivo: 'Vacunas',
    hora: '09:30',
  },
  {
    dueno: 'Bruno Díaz',
    nombre: 'Mora',
    especie: 'Gato',
    raza: null,
    motivo: 'Control',
    hora: '11:00',
  },
  {
    dueno: 'Carla Ruiz',
    nombre: 'Tito',
    especie: 'Perro',
    raza: 'Pug',
    motivo: 'Vacunas',
    hora: '14:30',
  },
  {
    dueno: 'Diego Paz',
    nombre: 'Nube',
    especie: 'Gato',
    raza: 'Siamés',
    motivo: 'Estética',
    hora: '17:00',
  },
];

// San Isidro cerró la jornada: no queda nada por agendar, así que la lista
// aparece vacía a propósito.
function citasDeEjemplo(sede: SedeVeterinaria): CitaLista[] {
  if (sede === 'San Isidro') return [];

  const hoy = new Date();
  const fecha = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');

  return citasEjemploDelDia.map((ejemplo, indice) => ({
    id: -1000 - indice,
    key: `ejemplo-${indice}`,
    mascota: ejemplo.nombre,
    motivo: ejemplo.motivo,
    // Solo la hora: son citas del día, la fecha se selections arriba.
    fecha: `${ejemplo.hora} hs`,
    dueno: ejemplo.dueno,
    guardado: {
      id: -1000 - indice,
      tipo: ejemplo.motivo,
      sede,
      fecha,
      hora: ejemplo.hora,
      llegadaEn: null,
      // Todavia no fue atendido: la descripcion la carga el veterinario
      // al completar el turno.
      descripcion: null,
      mascotaId: -1000 - indice,
      mascota: {
        id: -1000 - indice,
        nombre: ejemplo.nombre,
        especie: ejemplo.especie,
        raza: ejemplo.raza,
        foto: null,
      },
    },
  }));
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
  const [sedeQr, setSedeQr] = useState<SedeVeterinaria>('Recoleta');
  const [sedeSeleccionada, setSedeSeleccionada] = useState<SedeVeterinaria>('Recoleta');
  const [fotosEjemplo, setFotosEjemplo] = useState<string[]>([]);

  // Las fotos de las citas de ejemplo. Van por la API porque en la base hay
  // formatos que el empaquetador de la app no sabe leer.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const usuario = await obtenerUsuarioActual();
        if (!usuario) return;
        const response = await fetch(`${API_BASE_URL}/api/mascotas/fotos-ejemplo`, {
          headers: { Authorization: `Bearer ${usuario.accessToken}` },
        });
        if (!response.ok) return;
        const resultado: unknown = await response.json();
        if (
          vigente &&
          typeof resultado === 'object' &&
          resultado !== null &&
          'fotos' in resultado &&
          Array.isArray(resultado.fotos) &&
          resultado.fotos.every((foto) => typeof foto === 'string')
        ) {
          setFotosEjemplo(resultado.fotos as string[]);
        }
      } catch {
        // Si no llegan fotos, cada cita usa la de respaldo.
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

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

  // Lado de la foto de las citas. Se mide el alto real de la lista con onLayout
  // en vez de suponERlo: la lista es el 52% del area util (que ya no es toda la
  // ventana, hay que descontar el encabezado del menu) y con la cuenta
  //_estimada_ las tarjetas se pasaban del borde.
  const [altoLista, setAltoLista] = useState(0);
  const altoListaReal = altoLista || (windowHeight - 64) * 0.52;
  // De ese alto salen el titulo, los tres huecos y los paddings de la lista y de
  // las tarjetas. Si se suma algo nuevo hay que descontarlo aca tambien, si no
  // la ultima tarjeta se pasa del borde de la pantalla.
  const ladoFotoTarjeta = Math.round(
    Math.max(38, Math.min(96, (altoListaReal - 78) / 4 - 26))
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

// En la portada solo van 4 citas. La agenda completa esta en la pantalla de
  // Turnos, asi que aca no hace falta verlas todas.
  const COTAS_PROXIMAS = 4;

  // Las 4 citas del admin son fijas, no vienen de la API. Un usuario normal ve
  // sus turnos de verdad.
  const citasVisibles: CitaLista[] = esAdmin
    ? citasDeEjemplo(sedeSeleccionada).map((cita, indice) => ({
        ...cita,
        // Las fotos vienen de la API para poder usar cualquier formato que
        // tenga la base. Si no hay, cae en la de respaldo.
        fotoUri: fotosEjemplo[indice] ?? null,
      }))
    : turnosGuardados
        .filter((turno) => turnoSiguePendiente(turno, new Date()))
        .map((turno) => ({
          id: -turno.id,
          key: `guardado-${turno.id}`,
          mascota: turno.mascota.nombre,
          motivo: turno.tipo,
          fecha: `${turno.hora} hs`,
          dueno: nombreCompleto || null,
          guardado: turno,
        }))
        .slice(0, COTAS_PROXIMAS);

  const citasConFoto = citasVisibles.map((cita) => ({
    ...cita,
    fotoLocal: cita.fotoLocal ?? (cita.fotoUri ? null : fotoRespaldo),
  }));
// El veterinario a veces quiere el QR en papel para colgarlo en la puerta. Se
  // arma una hoja simple con el mismo valor que muestra el cartel.
  const imprimirQr = async (sede: SedeVeterinaria) => {
    // El SVG del QR se arma aca y no con un script de internet: antes la hoja
    // pedia el qrcode-generator a un CDN y sin conexion salia en blanco.
    const svgQr = await toString(checkInDeSede(sede), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 300,
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>QR ${sede}</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 40px; }
  h1 { color: #0f3e17; }
  svg { width: 300px; height: 300px; }
</style></head>
<body>
  <h1>VetPro</h1>
  <h2>Codigo QR de llegada</h2>
  <p>Presentá este código para que los usuarios registren su llegada.</p>
  <div>${svgQr}</div>
  <h3 style="color: #0f3e17;">${sede}</h3>
</body></html>`;

    // expo-print es nativo y no existe en web: ahi se usa el dialogo del
    // navegador. Antes salia "No se pudo abrir la impresion desde aca".
    if (Platform.OS === 'web') {
      try {
        const ventana = window.open('', '_blank', 'width=520,height=760');
        if (!ventana) {
          setErrorTurnos('El navegador bloqueó la impresión. Permití las ventanas emergentes.');
          return;
        }
        ventana.document.write(html);
        ventana.document.close();
        ventana.focus();
        await new Promise((resolver) => setTimeout(resolver, 300));
        ventana.print();
      } catch (printError) {
        console.error('No se pudo imprimir el QR en el navegador:', printError);
        setErrorTurnos('No se pudo abrir la impresión desde acá.');
      }
      return;
    }

    try {
      const Print = await import('expo-print');
      const archivo = await Print.printToFileAsync({ html });
      await Print.printAsync({ uri: archivo.uri });
    } catch (printError) {
      console.error('No se pudo imprimir el QR:', printError);
      setErrorTurnos('No se pudo abrir la impresion desde aca.');
    }
  };

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

const renderCita = (item: CitaLista) => {
  const foto =
    item.fotoUri
      ? { uri: item.fotoUri }
      : (item.fotoLocal ??
        (item.guardado.mascota.foto ? { uri: item.guardado.mascota.foto } : null));
  return (
    <Pressable
      key={item.key}
      style={({ pressed }) => [
        styles.citaTarjeta,
        { minHeight: ladoFotoTarjeta + 22 },
        pressed && estilos.buttonPressed,
      ]}
      onPress={() => setCitaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${item.mascota}`}
    >
      <View style={styles.citaFila}>
        {foto ? (
          <Image
            source={foto}
            style={[styles.citaFoto, { width: ladoFotoTarjeta, height: ladoFotoTarjeta }]}
            resizeMode="cover"
            accessibilityLabel={`Foto de ${item.mascota}`}
          />
        ) : (
          <View
            style={[
              styles.citaFotoVacia,
              { width: ladoFotoTarjeta, height: ladoFotoTarjeta },
            ]}
          >
            <Ionicons name="paw-outline" size={26} color="#0f3e17" />
          </View>
        )}
        <View style={styles.citaTexto}>
          <Text style={styles.citaTitulo} numberOfLines={1} ellipsizeMode="tail">
            {item.mascota} - {item.motivo}
          </Text>
          <Text style={styles.citaSubtitulo} numberOfLines={1} ellipsizeMode="tail">
            {item.fecha}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

  const accesos = esAdmin
    ? accesosRapidos.filter((acceso) => acceso.href !== '/mascotas')
    : accesosRapidos;

  return (
    <AppDrawer title="VetPro">
      <View style={styles.portada}>
        <View style={styles.portadaEncabezado}>
            <View style={styles.saludo}>
              <Text style={styles.saludoTexto}>¡Hola, {nombreUsuario}!</Text>
              <Text style={styles.saludoSubtexto}>¡Que tengas un excelente día!</Text>
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
                    <Ionicons name={acceso.icon} size={30} color="#0f3e17" />
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
                  ocultarLabel
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
                  style={({ pressed }) => [styles.qrBotonCompacto, pressed && estilos.buttonPressed]}
                  onPress={() => {
                    setSedeQr(sedeSeleccionada);
                    setModalQr(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Mostrar el código QR de llegada de ${sedeSeleccionada}`}
                >
                  <View style={estilos.qrBotonFila}>
                    <Ionicons name="qr-code-outline" size={22} color="#fffefc" />
                    <Text style={estilos.buttonTextPrimary}>Ver QR de llegada</Text>
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

          </View>

        {/* Un View y no un FlatList: son 4 citas fijas sin scroll. El FlatList
            sin flex media mal el alto y dejaba un hueco al final. */}
        <View
          style={styles.portadaLista}
          onLayout={(evento) => setAltoLista(evento.nativeEvent.layout.height)}
        >
          <Text style={styles.tituloSeccion}>Próximos turnos</Text>
          {cargandoTurnos ? (
            <ActivityIndicator color="#0f3e17" style={{ marginBottom: 12 }} />
          ) : errorTurnos ? (
            <Text style={[estilos.cardSubtitle, { marginBottom: 12 }]}>{errorTurnos}</Text>
          ) : null}
          {citasConFoto.length === 0 && !cargandoTurnos && !errorTurnos ? (
            <View style={styles.sinCitas}>
              <View style={styles.sinCitasIcono}>
                <Ionicons name="calendar-clear-outline" size={26} color="#0f3e17" />
              </View>
              <Text style={styles.sinCitasTitulo}>
                No hay próximos turnos en {sedeSeleccionada}
              </Text>
            </View>
          ) : (
            <View style={styles.tarjetasCitas}>
              {citasConFoto.map(renderCita)}
            </View>
          )}
        </View>
      </View>

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
              {/* Sin descripcion: son turnos proximos, todavia no fueron
                  atendidos. La descripcion la carga el veterinario al completar
                  el turno, en la pantalla de atencion. */}
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
                <QRCode value={checkInDeSede(sedeQr)} size={220} />
              </View>
              <Text style={styles.qrAdminSede}>{sedeQr}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [estilos.addPetButton, pressed && estilos.buttonPressed]}
              onPress={() => void imprimirQr(sedeQr)}
              accessibilityRole="button"
              accessibilityLabel={`Imprimir el código QR de ${sedeQr}`}
            >
              <Ionicons name="print-outline" size={19} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>Imprimir QR - {sedeQr}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

// Con StyleSheet.create y no un objeto plano: asi React Native registra los
// estilos y Fast Refresh no se queda con la version vieja cuando edito.
const styles = StyleSheet.create({
  // La portada entra entera en la pantalla: sin scroll.
  // Se parte en dos: el encabezado toma el alto sobrante y la lista de citas
  // toma solo el suyo, asi el alto no salta al cambiar de sede.
  portada: { flex: 1, backgroundColor: '#fffefc' },
  // Reparto fijo: el encabezado se lleva el 48% de la pantalla y la lista de
  // citas el 52%, siempre. Asi el bloque de citas tiene el mismo peso en
  // cualquier telefono y no queda un hueco gigante en el medio.
  portadaEncabezado: {
    flexBasis: '48%' as DimensionValue,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: 'space-evenly' as const,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 2,
  },
  // El alto de las tarjetas se reparte dentro de esta mitad: si el telefono es
  // mas alto, las citas se agrandan en vez de dejar el espacio vacio arriba.
  portadaLista: {
    flexBasis: '52%' as DimensionValue,
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
  },
  tarjetasCitas: { flex: 1, gap: 8 },
sinCitas: {
    alignItems: 'center' as const,
    marginTop: 8,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dcecdc',
    backgroundColor: '#f2f9f1',
  },
  sinCitasIcono: {
    width: 52,
    height: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 10,
    borderRadius: 26,
    backgroundColor: '#e4f1e0',
  },
  sinCitasTitulo: { color: '#0f3e17', fontSize: 15, fontWeight: '600' as const },
citaTarjeta: {
    flex: 1,
    flexShrink: 1,
    justifyContent: 'center' as const,
    backgroundColor: '#e1f4df',
    padding: 10,
    borderRadius: 16,
    borderColor: '#efeeeb',
    borderWidth: 1,
  },
  citaFila: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 13,
  },
  // El lado de la foto y el alto minimo de la tarjeta los calcula la pantalla
  // (ver ladoFotoTarjeta). Con flex solo se deformaban en telefonos chicos.
  citaFoto: { width: 72, height: 72, borderRadius: 16, backgroundColor: '#cfe7d3' },
  citaFotoVacia: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#cfe7d3',
  },
  citaTexto: { flex: 1 },
  citaTitulo: {
    color: '#0f3e17',
    fontSize: 17,
    fontWeight: 'bold' as const,
  },
  citaSubtitulo: { marginTop: 3, color: '#4a6152', fontSize: 15 },
  qrAdminBotonFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tituloSeccion: {
    marginBottom: 10,
    color: '#0f3e17',
    fontSize: 22,
    fontWeight: 'bold' as const,
  },
  qrBotonCompacto: {
    backgroundColor: '#0f3e17',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center' as const,
  },
  imprimirQr: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#0f3e17',
    backgroundColor: '#f2f9f1',
  },
  imprimirQrTexto: { color: '#0f3e17', fontSize: 14, fontWeight: '600' as const },
saludo: {
    width: '100%' as DimensionValue,
    alignItems: 'center' as const,
    paddingTop: 4,
    paddingBottom: 10,
  },
  saludoTexto: {
    alignSelf: 'stretch' as const,
    color: '#0f3e17',
    fontSize: 28,
    fontWeight: 'bold' as const,
    marginBottom: 3,
    textAlign: 'center' as const,
  },
  saludoSubtexto: {
    alignSelf: 'stretch' as const,
    color: '#556b58',
    fontSize: 15,
    textAlign: 'center' as const,
  },
  accesos: {
    width: '100%' as DimensionValue,
    flexDirection: 'row' as const,
    gap: 16,
    marginBottom: 0,
  },
  // Los espacios entre los bloques los pone space-evenly del encabezado.
  bloqueSede: {},
  acceso: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 18,
    backgroundColor: '#f2f9f1',
  },
  accesoIcono: {
    width: 50,
    height: 50,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 16,
    backgroundColor: '#e4f1e0',
  },
  accesoTexto: {
    color: '#1e3326',
    fontSize: 13,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  mascotasVacias: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  qrAdminBloque: {
    marginVertical: 0,
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
  qrAdminSede: {
    marginTop: 12,
    color: '#0f3e17',
    fontSize: 18,
    fontWeight: 'bold' as const,
  },
  turnPhotoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 10,
    backgroundColor: '#cfe7d3',
  },
});