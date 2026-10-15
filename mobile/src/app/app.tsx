import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
// Import de la impresion del QR (ver imprimirQr mas abajo).
import { toString } from 'qrcode';
import type { DimensionValue, ImageSourcePropType } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  descripcionEspecieMascota,
  direccionesSedes,
  nombreEspecieMascota,
  sedesVeterinaria,
  turnoSiguePendiente,
  type SedeVeterinaria,
  type TurnoGuardado,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import QRCode from 'react-native-qrcode-svg';
import { checkInDeSede } from '@/lib/check-in';
import { useSedeSeleccionada } from '@/lib/sede';
import { turnosEjemploCliente } from '@/lib/turnos-ejemplo';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  edad: number | null;
  foto: string | null;
};

// La agenda del admin trae el turno con su dueño y su estado de atención; los
// turnos del propio usuario vienen mas pelados.
type TurnoAgenda = TurnoGuardado & {
  atendidoEn?: string | null;
  user?: { nombre: string } | null;
  /** Los turnos de relleno del cliente se arman en lib/turnos-ejemplo. */
  esDemo?: boolean;
};

type CitaLista = {
  id: number;
  key: string;
  mascota: string;
  motivo: string;
  /** "Hoy - 11:30 hs" o "13/10 - 09:00 hs". */
  cuando: string;
  /** Tercera linea: el dueño en la agenda del admin, la sede para el cliente. */
  detalle: string | null;
  dueno: string | null;
  /** Foto local, para cuando no hay ninguna que venga de la API. */
  fotoLocal?: ImageSourcePropType | null;
  /** Foto que llega de la API como data URI. */
  fotoUri?: string | null;
  guardado: TurnoAgenda;
};


/**
 * "Hoy", "Mañana" o "13/10". Antes la tarjeta showed solo la hora y dos turnos
 * de dias distintos a las 10 parecian el mismo, uno repetido.
 */
function fechaRelativaCorta(fecha: string, ahora: Date): string {
  const [year, month, day] = fecha.split('-').map(Number);
  if (!year || !month || !day) return fecha;
  const dias = Math.round(
    (new Date(year, month - 1, day).getTime() -
      new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime()) /
      86400000
  );
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

// Alto de la tarjeta de "Tus Mascotas". La lista y la tarjeta usan el mismo
// numero: si difieren, el texto se pisa con la foto o sobra aire abajo.
const ALTO_CARD_MASCOTA = 132;

// Foto de respaldo si el backend no devuelve fotos: en la base puede haber
// formatos (AVIF) que el empaquetador no acepta, asi que llegan por la API.
const fotoRespaldo = require('@/assets/images/mascota-demo.jpg') as ImageSourcePropType;

// Los accesos rapidos de la portada. El admin no ve "Mascotas" porque es la
// agenda de la veterinaria, no la de una persona. "Historial" ya no esta: la
// pantalla se saco del proyecto.
const accesosRapidos = [
  { label: 'Turnos', href: '/turnos', icon: 'calendar-outline' },
  { label: 'Mascotas', href: '/mascotas', icon: 'paw-outline' },
  { label: 'Notificaciones', href: '/notificaciones', icon: 'notifications-outline' },
  { label: 'Perfil', href: '/perfil', icon: 'person-outline' },
] as const;

export default function InicioScreen() {
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargandoMascotas, setCargandoMascotas] = useState(true);
  const [errorMascotas, setErrorMascotas] = useState('');
  const [turnosGuardados, setTurnosGuardados] = useState<TurnoAgenda[]>([]);
  // El momento se guarda al cargar los datos: es la referencia para saber que
  // turnos ya pasaron su hora.
  const [ahora, setAhora] = useState(() => new Date());
  const [cargandoTurnos, setCargandoTurnos] = useState(true);
  const [errorTurnos, setErrorTurnos] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [modalQr, setModalQr] = useState(false);
  const [imprimiendoQr, setImprimiendoQr] = useState(false);
  const [qrAviso, setQrAviso] = useState('');
  const [sedeQr, setSedeQr] = useState<SedeVeterinaria>('Recoleta');
  // La sede es la misma que en la pantalla de Turnos: el hook la guarda en el
  // dispositivo, asi no hay que elegirla de nuevo en cada pantalla.
const [sedeSeleccionada, setSedeSeleccionada] = useSedeSeleccionada();

  const accesos = esAdmin
    ? accesosRapidos.filter((acceso) => acceso.href !== '/mascotas')
    : accesosRapidos;

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

  // En la portada van 3 citas. La agenda completa esta en la pantalla de
  // Turnos, asi que aca no hace falta ver mas.
  const COTAS_PROXIMAS = 3;

  /**
   * Cuantos turnos ve el admin, por sede. No es el mismo numero para las tres
   * porque las sedes no se parecen entre si: San Isidro abre el dia, asi que a
   * esa hora hay 3 o 4 personas por llegar y no la manana entera. Con un tope
   * comun la portada se llenaba de San Isidro y seemed la agenda de la
   * veterinaria entera colgada de la manana.
   *
   * Recoleta es la hora pico y por ahi si entra mas. Vicente Lopez cierra la
   * jornada, asi que casi nunca tiene tantos pendientes y el tope no llega a
   * molestar.
   */
  const COTAS_ADMIN_POR_SEDE: Record<SedeVeterinaria, number> = {
    'San Isidro': 4,
    Recoleta: 6,
    'Vicente López': 6,
  };

  // Las tarjetas se miden como las de la pantalla de Turnos: alto del contenido
  // y foto cuadrada de 56. Antes el alto salia de una cuenta sobre el alto de la
  // pantalla y las tarjetas quedaban enormes en telefonos altos.
  const LADO_FOTO_CITA = 56;

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
        // El admin mira la agenda de la veterinaria, no la de una persona.
        usuario.esAdmin
          ? `${API_BASE_URL}/api/admin/turnos`
          : `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`,
        { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
      );
      const resultado = await response.json();
      if (!response.ok) {
        setErrorTurnos(resultado.message ?? 'No se pudieron cargar tus turnos.');
        setTurnosGuardados([]);
        return;
      }
      setTurnosGuardados(resultado);
      setAhora(new Date());
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


  // Los turnos que ya se atendieron no vuelven a salir. Antes no se filtraban y
  // la portada mostraba como "proximos" turnos que ya habian pasado por el
  // consultorio: por eso se veian dos a las 10 y dos a las 11.
  //
  // El admin ve la agenda real de la veterinaria. El cliente ve los mismos
  // ejemplos que la pantalla de Turnos, armados con sus propias mascotas: son
  // los unicos datos que esa pantalla muestra, asi que la portada tiene que
  // mostrar los mismos y no los turnos sueltos que quedaron de las pruebas.
  const turnosPendientes = useMemo(() => {
    // El cliente ve los turnos reales de la base, los mismos que su pantalla de
    // Turnos, para que las dos pantallas no digan cosas distintas del mismo
    // turno. Los ejemplos quedan de respaldo si todavia no se creo nada.
    const base =
      esAdmin || turnosGuardados.length > 0 ? turnosGuardados : turnosEjemploCliente(mascotas);
    return base
      .filter((turno) => !turno.atendidoEn)
      // Los ejemplos de relleno se muestran siempre, como en la pantalla de
      // Turnos. Si no, a la tarde ya no queda ninguno: los 4 de hoy se generan
      // entre las 10:00 y las 11:30 y a las 17:00 turnoSiguePendiente los
      // daba por vencidos, asi que "Proximos turnos" salia vacio.
      .filter((turno) => turno.esDemo === true || turnoSiguePendiente(turno, ahora))
      .sort((a, b) =>
        a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : a.fecha.localeCompare(b.fecha)
      );
  }, [turnosGuardados, mascotas, esAdmin, ahora]);

  // El admin ve los turnos de verdad de la sede que esta mirando, y un cliente
  // los suyos. Antes el admin veia nombres de ejemplo fijos (Lola, Mora, Tito,
  // Nube) que no tenian nada que ver con la sede elegida.
  const citasVisibles: CitaLista[] = esAdmin
    ? turnosPendientes
        .filter((turno) => turno.sede === sedeSeleccionada)
        .slice(0, COTAS_ADMIN_POR_SEDE[sedeSeleccionada])
        .map((turno) => ({
          id: turno.id,
          key: `admin-${turno.id}`,
          mascota: turno.mascota.nombre,
          motivo: turno.tipo,
          cuando: `${fechaRelativaCorta(turno.fecha, ahora)} - ${turno.hora} hs`,
          detalle: turno.user?.nombre ?? null,
          dueno: turno.user?.nombre ?? null,
          guardado: turno,
        }))
    : turnosPendientes
        .slice(0, COTAS_PROXIMAS)
        .map((turno) => ({
          id: -turno.id,
          key: `guardado-${turno.id}`,
          mascota: turno.mascota.nombre,
          motivo: turno.tipo,
          cuando: `${fechaRelativaCorta(turno.fecha, ahora)} - ${turno.hora} hs`,
          // El cliente no tiene filtro de sede en la portada: decir en cual va
          // a atenderse es lo unico que aporta la tercera linea.
          detalle: turno.sede,
          dueno: nombreCompleto || null,
          guardado: turno,
        }));

  // La foto de respaldo se resuelve en renderCita, cuando ya se sabe si el
  // turno trae foto.
  const renderCita = (item: CitaLista) => {
  // Orden de preferencia: la foto de la mascota del turno, la que venga como
  // data URI y, si no hay ninguna, la de respaldo. Antes la de respaldo se
  // ganaba siempre y todas las tarjetas salian con la misma foto generica.
  const foto = item.guardado.mascota.foto
    ? { uri: item.guardado.mascota.foto }
    : item.fotoUri
      ? { uri: item.fotoUri }
      : (item.fotoLocal ?? fotoRespaldo);
  return (
    <Pressable
      key={item.key}
style={({ pressed }) => [
   estilos.cardTurno,
   styles.citaTarjeta,
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
style={[styles.citaFoto, { width: LADO_FOTO_CITA, height: LADO_FOTO_CITA }]}
   resizeMode="contain"
   accessibilityLabel={`Foto de ${item.mascota}`}
   />
   ) : (
   <View
   style={[
   styles.citaFotoVacia,
   { width: LADO_FOTO_CITA, height: LADO_FOTO_CITA },
   ]}
   >
   {/* La huella se escala con el lado de la foto: fijo en 26 llenaba
   todo el cuadro de 56 y se veía desproporcionado al achicarlo. */}
   <Ionicons
   name="paw-outline"
   size={Math.round(LADO_FOTO_CITA * 0.42)}
   color="#0f3e17"
   />
   </View>
   )}
        <View style={styles.citaTexto}>
          <Text
            style={[estilos.cardTituloTurno, styles.citaTitulo]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item.mascota} - {item.motivo}
          </Text>
          <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
            {item.cuando}
          </Text>
          {item.detalle ? (
            <Text style={styles.citaDetalle} numberOfLines={1} ellipsizeMode="tail">
              {item.detalle}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color="#8aa38c" />
      </View>
    </Pressable>
  );
};
  // ------------------------------------------------------------------
  // IMPRIMIR EL QR (solo admin, desde la ventana del QR de la portada).
  //
  // Sirve para tener el QR en papel, colgado en la puerta de la sede.
  // El aviso de error va en un texto abajo del boton y no en setErrorTurnos:
  // ese estado se muestra en la franja de "Proximos turnos", que es del
  // usuario normal, asi que para el admin el errorseria invisible.
  // ------------------------------------------------------------------
  // El veterinario a veces quiere el QR en papel para colgarlo en la puerta. Se
  // arma una hoja simple con el mismo valor que muestra el cartel.
  const imprimirQr = async (sede: SedeVeterinaria) => {
    if (imprimiendoQr) return;
    setQrAviso('');
    setImprimiendoQr(true);

    try {
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
            setQrAviso('El navegador bloqueó la impresión. Permití las ventanas emergentes.');
            return;
          }
          ventana.document.write(html);
          ventana.document.close();
          ventana.focus();
          await new Promise((resolver) => setTimeout(resolver, 300));
          ventana.print();
        } catch (printError) {
          console.error('No se pudo imprimir el QR en el navegador:', printError);
          setQrAviso('No se pudo abrir la impresión desde acá.');
        }
        return;
      }

      try {
        const Print = await import('expo-print');
        const archivo = await Print.printToFileAsync({ html });
        await Print.printAsync({ uri: archivo.uri });
      } catch (printError) {
        console.error('No se pudo imprimir el QR:', printError);
        setQrAviso('No se pudo abrir la impresión desde acá.');
      }
    } finally {
      setImprimiendoQr(false);
    }
  };

  const renderMascota = ({ item }: { item: Mascota }) => (
    <Pressable
      style={({ pressed }) => [styles.mascotaCard, pressed && estilos.buttonPressed]}
      onPress={() => setMascotaSeleccionada(item)}
      accessibilityRole="button"
      accessibilityLabel={`Ver foto de ${item.nombre}`}
    >
      {/* La foto vive en un contenedor con flex: 1, o sea que se achica solo
          para dejarle lugar a los dos textos de abajo. Antes tenia alto fijo y
          con una raza larga el nombre salia debajo de la foto, superpuesto. */}
      <View style={styles.mascotaFotoArea}>
        {item.foto ? (
          <Image
            source={{ uri: item.foto }}
            style={styles.mascotaFoto}
            resizeMode="contain"
            accessibilityLabel={`Vista previa de ${item.nombre}`}
          />
        ) : (
          <Ionicons name="paw-outline" size={26} color="#0f3e17" />
        )}
      </View>
      <Text style={styles.mascotaNombre} numberOfLines={1} ellipsizeMode="tail">
        {item.nombre}
      </Text>
      <Text style={styles.mascotaRaza} numberOfLines={1} ellipsizeMode="tail">
        {nombreEspecieMascota(item.especie, item.raza)}
      </Text>
    </Pressable>
  );

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
                    <Ionicons name={acceso.icon} size={28} color="#0f3e17" />
                  </View>
                  <Text style={styles.accesoTexto} numberOfLines={2}>
                    {acceso.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Todo el aire que sobra va entre los accesos y el bloque de abajo.
                Repartido en partes iguales dejaba los accesos pegados a "Tus
                Mascotas" y un hueco grande antes del boton de QR. Este separador
                va FUERA de la fila de accesos: adentro le robaba ancho a las
                cajas y "Notificaciones" se partia a mitad de palabra. */}
            {/* El empuje elástico solo va en la portada de usuario, que tiene el
                carrusel de mascotas abajo para consumirlo. En el admin no hay
                carrusel: el separador se convertia en un hueco enorme entre los
                accesos y la sede y el encabezado quedaba amontonado contra el
                techo de la pantalla. */}
            {esAdmin ? null : <View style={styles.empujeEncabezado} />}

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
                <Text style={styles.tituloSeccion}>Tus Mascotas</Text>
                <FlatList
                  horizontal
                  data={mascotas}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderMascota}
                  showsHorizontalScrollIndicator={false}
                  style={[estilos.horizontalList, styles.listaMascotas]}
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
                    setQrAviso('');
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
                style={StyleSheet.flatten([estilos.qrBoton, styles.botonQrPortada])}
                  accessibilityRole="link"
                  accessibilityLabel="Escanear código QR de llegada"
                >
                  <View style={estilos.qrBotonFila}>
                    <Ionicons name="qr-code-outline" size={20} color="#fffefc" />
                    <Text style={estilos.buttonTextPrimary}>Escanear QR de llegada</Text>
                  </View>
                </Pressable>
              </Link>
            )}

          </View>

        {/* Un View y no un FlatList: son 3 citas fijas sin scroll. El FlatList
            sin flex media mal el alto y dejaba un hueco al final.
            La lista se ancla al fondo con justifyContent para que las 3
            tarjetas ocupen siempre la ultima franja de la pantalla y el aire
            sobrante quede entre el encabezado y el titulo, no repartido entre
            las tarjetas. */}
        <View style={styles.portadaLista}>
          {/* Absorbe el aire sobrante con tope: sin maxHeight, en pantallas
              muy altas el hueco entre el encabezado y el titulo crecia sin
              limite. El limite deja una banda de respiracion razonable y el
              resto lo toma la franja de las tarjetas, que queda al pie. */}
          <View style={styles.huecoLista} />
          <Text style={styles.tituloSeccion}>Próximos turnos</Text>
          {cargandoTurnos ? (
            <ActivityIndicator color="#0f3e17" style={{ marginBottom: 12 }} />
          ) : errorTurnos ? (
            <Text style={[estilos.cardSubtitle, { marginBottom: 12 }]}>{errorTurnos}</Text>
          ) : null}
          {citasVisibles.length === 0 && !cargandoTurnos && !errorTurnos ? (
            <View style={styles.sinCitas}>
              <View style={styles.sinCitasIcono}>
<Ionicons name="calendar-clear-outline" size={18} color="#0f3e17" />
   </View>
   <Text style={styles.sinCitasTitulo}>
   No hay turnos programados
   </Text>
            </View>
          ) : (
            /* Scrollea SOLO esta franja. Con un View comun las tarjetas se
               desbordaban y en web se movia la pantalla entera, con lo que el
               saludo, los accesos y el boton de QR se iban al scroll. Con el
               ScrollView la zona de arriba queda siempre fija y solo bajan las
               tarjetas. */
            <ScrollView
              style={styles.tarjetasCitas}
              contentContainerStyle={styles.tarjetasCitasContenido}
              showsVerticalScrollIndicator={false}
            >
              {citasVisibles.map(renderCita)}
            </ScrollView>
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
              
              <View style={styles.modalSede}>
                <Text style={estilos.modalText}>
                  <Text style={styles.modalEtiqueta}>Sede: </Text>
                  {citaSeleccionada.guardado.sede}
                </Text>
                <Text style={estilos.modalText}>
                  <Text style={styles.modalEtiqueta}>Dirección: </Text>
                  {direccionesSedes[citaSeleccionada.guardado.sede]}
                </Text>
              </View>

              {/* Boton de adorno: todavia no abre nada. Se saco el Linking,
                  que en web no existe y en Android se lleva la app afuera.
                  Cuando se defina a donde lleva, se le pone el onPress. */}
              {!esAdmin ? (
                <Pressable
                  // Mismo verde y mismo radio que "Escanear QR de llegada": dos
                  // botones distintos al lado en la misma pantalla se ven mal.
                  style={({ pressed }) => [
                    estilos.qrBoton,
                    styles.irBoton,
                    pressed && estilos.buttonPressed,
                  ]}
                  onPress={() => {
                    // Sin accion a proposito.
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Ir a la sede"
                  accessibilityHint="Todavía no está disponible"
                >
                  <Text style={estilos.buttonTextPrimary}>Ir</Text>
                </Pressable>
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

            {/* Boton de imprimir. Solo aparece en esta ventana, que es la unica
                parte de la portada que es del admin (esAdmin). */}
            <Pressable
              style={({ pressed }) => [
                estilos.addPetButton,
                styles.qrAdminBotonImprimir,
                pressed && estilos.buttonPressed,
                imprimiendoQr && styles.qrAdminBotonOcupado,
              ]}
              onPress={() => void imprimirQr(sedeQr)}
              disabled={imprimiendoQr}
              accessibilityRole="button"
              accessibilityLabel={`Imprimir el código QR de ${sedeQr}`}
            >
              <Ionicons name="print-outline" size={19} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>
                {imprimiendoQr ? 'Preparando...' : `Imprimir QR - ${sedeQr}`}
              </Text>
            </Pressable>

            {/* El aviso va aca adentro y no en setErrorTurnos: ese estado se
                muestra en la franja de "Proximos turnos", que es del usuario
                normal, y para el admin no existiria en pantalla. */}
            {qrAviso ? <Text style={styles.qrAdminAviso}>{qrAviso}</Text> : null}
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}


const styles = StyleSheet.create({

  portada: { flex: 1, backgroundColor: '#fffefc' },

  // "Proximos turnos" arranca al 55% de la pantalla y se lleva el 45% que queda.
  // El alto del encabezado se calcula con la pantalla en vez de con un
  // porcentaje: la barra de arriba de la app queda fuera del reparto y con
  // flexBasis el titulo se corria.
  portadaEncabezado: {
    justifyContent: 'flex-start' as const,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    // Los accesos llevan su propio marginBottom, pero el separador elastico
    // (flex: 1) solo existe en la portada de usuario. Sin este minHeight el
    // admin queda pegado al borde inferior del encabezado.
    minHeight: 4,
  },
  // Sin justifyContent: el espaciador huecoLista (flex: 1) ya empuja el titulo
  // y las tarjetas al pie. Con flex-end y un hijo flex: 1 los dos se pelean.
  portadaLista: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  // El alto lo fija altoZonaTurnos desde el JSX con flexGrow/flexShrink
  // explicitos. OJO: no usar el atajo `flex: 0` ni `flex: 1` aca, porque ambos
  // expanden a flexBasis: 0%, que le gana al height y deja la zona de tarjetas
  // aplastada contra el pie de la pantalla.
  // El ScrollView toma el alto que sobra y scrollea por dentro. El hueco de
  // arriba esta topeado en 34, asi que todo el resto queda para las tarjetas y
  // el titulo "Proximos turnos" se sigue arrancando en el mismo lugar.
  tarjetasCitas: { flex: 1 },
  // El gap va en el contenido, no en el ScrollView: el gap del contenedor es
  // el espacio entre el borde y las tarjetas y se pierde al scrollear.
  tarjetasCitasContenido: { gap: 8, paddingBottom: 2 },
  // Espaciador entre el encabezado y el titulo, con tope: sin maxHeight se
  // come todo el aire y deja un hueco enorme; sin tope las tarjetas quedan
  // pegadas al encabezado. 34 es una banda de respiracion razonable.
  huecoLista: { flex: 1, maxHeight: 34 },
sinCitas: {
   flexDirection: 'row' as const,
   alignItems: 'center' as const,
   alignSelf: 'stretch' as const,
   gap: 10,
   paddingVertical: 12,
   paddingHorizontal: 14,
   borderRadius: 12,
   borderWidth: 1,
   borderColor: '#dcecdc',
   backgroundColor: '#f2f9f1',
   },
  sinCitasIcono: {
   width: 34,
   height: 34,
   alignItems: 'center' as const,
   justifyContent: 'center' as const,
   borderRadius: 17,
   backgroundColor: '#e4f1e0',
   },
  sinCitasTitulo: { flex: 1, color: '#0f3e17', fontSize: 15, fontWeight: '600' as const },
  // La altura la pone altoCita en el JSX (1/3 de la franja), no flex: 1: con
  // flex la tarjeta se estira hasta llenar la franja y deforma el reparto.
  citaTarjeta: {
    justifyContent: 'center' as const,
    marginBottom: 0,
  },
  citaFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 13,
  },
  // Sin backgroundColor: la foto va con resizeMode="contain", asi que no
  // siempre llena el cuadro. Con fondo, las fotos apaisadas dejaban barras
  // verdes a los lados y las verticales arriba y abajo, y el cuadrado se leia
  // como un marco. Sin fondo el sobrante es transparente y se ve el verde de la
  // tarjeta, que es lo unico que hay que ver ahi.
  citaFoto: { borderRadius: 14 },
  // El estado sin foto si lleva fondo: no hay imagen que lo ocupe y sin el
  // cuadro el icono queda flotando sobre la tarjeta.
  citaFotoVacia: {
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#cfe7d3',
  },
  citaTexto: { flex: 1 },
  citaTitulo: { flexShrink: 1 },
  citaDetalle: { color: '#0f3e17', fontSize: 14, fontWeight: '600' as const },
  modalSede: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  // "Sede:" y "Direccion:" en negrita, el dato despues. Antes la sede
  // venia toda en negrita y la direccion suelta, sin etiqueta.
  modalEtiqueta: { fontWeight: '700' as const, color: '#0f3e17' },
  // El fondo, el radio y el alto salen de estilos.qrBoton: el mismo verde que
  // "Escanear QR de llegada".
  irBoton: { marginTop: 20, marginBottom: 0 },
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
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center' as const,
  },
saludo: {
    width: '100%' as DimensionValue,
    alignItems: 'center' as const,
    marginVertical: 30,
  },
  saludoTexto: {
    alignSelf: 'stretch' as const,
    color: '#0f3e17',
    fontSize: 24,
    fontWeight: 'bold' as const,
    marginBottom: 2,
    textAlign: 'center' as const,
  },
  saludoSubtexto: {
    alignSelf: 'stretch' as const,
    color: '#556b58',
    fontSize: 13,
    textAlign: 'center' as const,
  },
  accesos: {
    width: '100%' as DimensionValue,
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  empujeEncabezado: { flex: 1, minHeight: 8 },
  acceso: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
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
    // 11 y no 12: con 12 "Notificaciones" no entra en el ancho de la caja y se
    // partia a mitad de palabra ("Notificacion / es").
    fontSize: 11,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  bloqueSede: { marginTop: 4 },
  // El alto va en la lista y no en la card: con el alto fijo y el overflow
  // hidden en la card, una raza larga que hacia dos lineas la cortaba.
  listaMascotas: { height: ALTO_CARD_MASCOTA, marginBottom: 0 },
  mascotaCard: {
   width: 106,
   height: ALTO_CARD_MASCOTA,
   padding: 10,
   borderRadius: 14,
   backgroundColor: '#e1f4df',
   borderColor: '#efeeeb',
   borderWidth: 1,
   alignItems: 'center' as const,
  },
  // flex: 1 para que la foto tome lo que sobra y los dos textos de abajo
  // siempre entren: con el alto fijo la foto se comia el espacio del nombre.
  mascotaFotoArea: {
   flex: 1,
   width: '100%',
   alignItems: 'center' as const,
   justifyContent: 'center' as const,
   borderRadius: 10,
   overflow: 'hidden' as const,
   // Mismo color que mascotaCard: la foto va con contain y no llena el marco,
   // asi que con otro color se veia el contraste alrededor de la imagen.
   backgroundColor: '#e1f4df',
  },
  mascotaFoto: { width: '100%', height: '100%' },
  mascotaNombre: {
   alignSelf: 'stretch' as const,
   marginTop: 8,
   color: '#0f3e17',
   fontSize: 15,
   fontWeight: 'bold' as const,
   textAlign: 'center' as const,
  },
  mascotaRaza: {
   alignSelf: 'stretch' as const,
   marginTop: 1,
   color: '#4a6152',
   fontSize: 12,
   textAlign: 'center' as const,
  },
  mascotasVacias: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  // Sin el margen vertical de estilos.qrBoton: el de abajo empujaba todo el
  // bloque hacia arriba y dejaba los accesos pegados a "Tus Mascotas".
  botonQrPortada: { marginVertical: 0, marginTop: 14 },
  // 10 de separation con la sede de arriba: el bloque de QR pegado al selector
  // se leia como un solo control y no se distinguia donde terminaba uno.
  qrAdminBloque: {
    marginVertical: 0,
    marginTop: 10,
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
  // El boton de imprimir va debajo del marco del QR, con aire de la sede.
  qrAdminBotonImprimir: {
    alignSelf: 'stretch' as const,
    marginTop: 20,
  },
  qrAdminBotonOcupado: {
    opacity: 0.65,
  },
  qrAdminAviso: {
    marginTop: 14,
    color: '#6b6b6b',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center' as const,
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