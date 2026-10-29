import { edadDesdeNacimiento } from '@/lib/datos';
import { useCallback, useMemo, useState } from 'react';
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
import type { DimensionValue } from 'react-native';
import { AppDrawer } from '@/components/app-drawer';
import { SelectorCampo, type OpcionSelector } from '@/components/selector-campo';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  abrirMapa,
  descripcionEspecieMascota,
  nombreEspecieMascota,
  turnoSiguePendiente,
  type SedeVeterinaria,
  type TurnoGuardado,
} from '@/lib/datos';
import { useSesion } from '@/lib/sesion-context';
import { useRecordatorios } from '@/lib/recordatorios';
import QRCode from 'react-native-qrcode-svg';
import { checkInDeSede } from '@/lib/check-in';
import { guardarFiltroTurnos, useSedeSeleccionada, useSedes } from '@/lib/sede';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  fechaNacimiento: string;
  foto: string | null;
};

type TurnoAgenda = TurnoGuardado & {
  atendidoEn?: string | null;
  user?: { nombre: string } | null;};

type CitaLista = {
  id: number;
  key: string;
  mascota: string;
  motivo: string;

  cuando: string;

  detalle: string | null;
  dueno: string | null;
  guardado: TurnoAgenda;
};

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

const ALTO_CARD_MASCOTA = 132;

const accesosRapidos = [
  { label: 'Turnos', href: '/turnos', icon: 'calendar-outline' },
  { label: 'Mascotas', href: '/mascotas', icon: 'paw-outline' },
  { label: 'Notificaciones', href: '/notificaciones', icon: 'notifications-outline' },
  { label: 'Perfil', href: '/perfil', icon: 'person-outline' },
] as const;

export default function InicioScreen() {
  const sincronizarRecordatorios = useRecordatorios();
  const { usuario: usuarioSesion } = useSesion();
  const { sedes, errorSedes } = useSedes();
  const sedesVeterinaria = sedes.map((sede) => sede.nombre);
  const direccionesSedes = Object.fromEntries(sedes.map((sede) => [sede.nombre, sede.direccion]));
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [mascotaSeleccionada, setMascotaSeleccionada] = useState<Mascota | null>(null);
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaLista | null>(null);
  const [cargandoMascotas, setCargandoMascotas] = useState(true);
  const [errorMascotas, setErrorMascotas] = useState('');
  const [turnosGuardados, setTurnosGuardados] = useState<TurnoAgenda[]>([]);

  const [ahora, setAhora] = useState(() => new Date());
  const [cargandoTurnos, setCargandoTurnos] = useState(true);
  const [errorTurnos, setErrorTurnos] = useState('');
  const esAdmin = usuarioSesion?.esAdmin === true;
  const nombreCompleto = usuarioSesion?.nombre ?? '';
  const nombreUsuario = nombreCompleto.split(' ')[0];
  const [modalQr, setModalQr] = useState(false);
  const [imprimiendoQr, setImprimiendoQr] = useState(false);
  const [qrAviso, setQrAviso] = useState('');
  const [sedeQr, setSedeQr] = useState<SedeVeterinaria>('');

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

  const COTAS_PROXIMAS = 3;

  const COTAS_ADMIN = 6;

  const cargarMascotas = useCallback(async () => {
    setCargandoMascotas(true);
    setMascotas([]);
    setErrorMascotas('');
    try {
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`,
          { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
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
  }, [usuarioSesion]);

  useFocusEffect(
    useCallback(() => {
      void cargarMascotas();
    }, [cargarMascotas])
  );

  const cargarTurnos = useCallback(async () => {
    setCargandoTurnos(true);
    setErrorTurnos('');
    try {
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }
      const response = await fetch(

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
  }, [usuarioSesion]);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
      void sincronizarRecordatorios(true);
    }, [cargarTurnos, sincronizarRecordatorios])
  );

  const turnosPendientes = useMemo(() => turnosGuardados
    .filter((turno) => !turno.atendidoEn && turnoSiguePendiente(turno, ahora))
    .sort((a, b) => a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : a.fecha.localeCompare(b.fecha)),
    [turnosGuardados, ahora]);

  const citasVisibles: CitaLista[] = esAdmin
    ? turnosPendientes
        .slice(0, COTAS_ADMIN)
        .map((turno) => ({
          id: turno.id,
          key: `admin-${turno.id}`,
          mascota: turno.mascota.nombre,
          motivo: turno.tipo,
          cuando: `${fechaRelativaCorta(turno.fecha, ahora)} - ${turno.hora} hs`,
          detalle: [turno.user?.nombre, turno.sede].filter(Boolean).join(' · ') || null,
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

          detalle: turno.sede,
          dueno: nombreCompleto || null,
          guardado: turno,
        }));

  const renderCita = (item: CitaLista) => {
  const foto = item.guardado.mascota.foto ? { uri: item.guardado.mascota.foto } : null;
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
style={[styles.citaFoto, styles.tamanoFotoCita]}
   resizeMode="contain"
   accessibilityLabel={`Foto de ${item.mascota}`}
   />
   ) : (
   <View
   style={[
   styles.citaFotoVacia,
   styles.tamanoFotoCita,
   ]}
   >

   <Ionicons
   name="paw-outline"
   size={24}
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

  const imprimirQr = async (sede: SedeVeterinaria) => {
    if (imprimiendoQr) return;
    const sedeActual = sedes.find((item) => item.nombre === sede);
    if (!sedeActual) { setQrAviso('La sede ya no está disponible.'); return; }
    setQrAviso('');
    setImprimiendoQr(true);

    try {

      const svgQr = await toString(checkInDeSede(sedeActual.id), {
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

  const estilosAdaptados = StyleSheet.create({
    fotoAmpliada: { width: fotoModalSize, height: fotoModalSize },
  });

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

            {esAdmin ? null : <View style={styles.empujeEncabezado} />}

            {esAdmin ? (
              <View style={styles.bloqueSede}>
                <SelectorCampo
                  label="Sede del QR"
                  icono="location-outline"
                  placeholder="Elegí una sede"
                  opciones={opcionesSede}
                  seleccion={sedeSeleccionadaOpcion}
                  onSelect={(opcion) => {
                    setSedeSeleccionada(opcion.valor as SedeVeterinaria);
                    if (esAdmin) void guardarFiltroTurnos(opcion.valor).catch(() => {});
                  }}
                  compacto
                  accessibilityLabel="Elegir sede del QR de llegada"
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
                  disabled={!sedeSeleccionada}
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

        <View style={styles.portadaLista}>

          <View style={styles.huecoLista} />
          <Text style={styles.tituloSeccion}>Próximos turnos</Text>
          {cargandoTurnos ? (
            <ActivityIndicator color="#0f3e17" style={styles.separacionEstado} />
          ) : errorTurnos ? (
            <Text style={[estilos.cardSubtitle, styles.separacionEstado]}>{errorTurnos}</Text>
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
            <FlatList
              data={citasVisibles}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => renderCita(item)}
              style={styles.tarjetasCitas}
              contentContainerStyle={styles.tarjetasCitasContenido}
              showsVerticalScrollIndicator={false}
            />
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
                  style={[estilos.petPhoto, estilosAdaptados.fotoAmpliada]}
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
                  edadDesdeNacimiento(mascotaSeleccionada.fechaNacimiento) !== null
                    ? `${edadDesdeNacimiento(mascotaSeleccionada.fechaNacimiento)} años`
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
              <Pressable

                  style={({ pressed }) => [
                    estilos.qrBoton,
                    styles.irBoton,
                    pressed && estilos.buttonPressed,
                  ]}
                  onPress={() => void abrirMapa(citaSeleccionada.guardado.sede, direccionesSedes[citaSeleccionada.guardado.sede])}
                  accessibilityRole="button"
                  accessibilityLabel="Ir a la sede"
                  accessibilityHint="Abre el mapa con la dirección de la sede"
                >
                  <Text style={estilos.buttonTextPrimary}>Ir</Text>
                </Pressable>

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
                {sedes.find((item) => item.nombre === sedeQr) ? <QRCode value={checkInDeSede(sedes.find((item) => item.nombre === sedeQr)!.id)} size={220} /> : <Text>{errorSedes || 'No hay una sede seleccionada.'}</Text>}
              </View>
              <Text style={styles.qrAdminSede}>{sedeQr}</Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                estilos.addPetButton,
                styles.qrAdminBotonImprimir,
                pressed && estilos.buttonPressed,
                imprimiendoQr && styles.qrAdminBotonOcupado,
              ]}
              onPress={() => void imprimirQr(sedeQr)}
              disabled={imprimiendoQr || !sedes.some((item) => item.nombre === sedeQr)}
              accessibilityRole="button"
              accessibilityLabel={`Imprimir el código QR de ${sedeQr}`}
            >
              <Ionicons name="print-outline" size={19} color="#fffefc" />
              <Text style={estilos.buttonTextPrimary}>
                {imprimiendoQr ? 'Preparando...' : `Imprimir QR - ${sedeQr}`}
              </Text>
            </Pressable>

            {qrAviso ? <Text style={styles.qrAdminAviso}>{qrAviso}</Text> : null}
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = StyleSheet.create({

  portada: { flex: 1, backgroundColor: '#fffefc' },

  portadaEncabezado: {
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,

    minHeight: 4,
  },

  portadaLista: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },

  tarjetasCitas: { flex: 1 },

  tarjetasCitasContenido: { gap: 8, paddingBottom: 2 },

  huecoLista: { flex: 1, maxHeight: 34 },
sinCitas: {
   flexDirection: 'row',
   alignItems: 'center',
   alignSelf: 'stretch',
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
   alignItems: 'center',
   justifyContent: 'center',
   borderRadius: 17,
   backgroundColor: '#e4f1e0',
   },
  sinCitasTitulo: { flex: 1, color: '#0f3e17', fontSize: 15, fontWeight: '600' },

  citaTarjeta: {
    justifyContent: 'center',
    marginBottom: 0,
  },
  citaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },

  citaFoto: { borderRadius: 14 },

  citaFotoVacia: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#cfe7d3',
  },
  citaTexto: { flex: 1 },
  citaTitulo: { flexShrink: 1 },
  citaDetalle: { color: '#0f3e17', fontSize: 14, fontWeight: '600' },
  modalSede: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },

  modalEtiqueta: { fontWeight: '700', color: '#0f3e17' },

  irBoton: { marginTop: 20, marginBottom: 0 },
  tituloSeccion: {
    marginBottom: 10,
    color: '#0f3e17',
    fontSize: 22,
    fontWeight: 'bold',
  },
  qrBotonCompacto: {
    backgroundColor: '#0f3e17',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
saludo: {
    width: '100%' as DimensionValue,
    alignItems: 'center',
    marginVertical: 30,
  },
  saludoTexto: {
    alignSelf: 'stretch',
    color: '#0f3e17',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 2,
    textAlign: 'center',
  },
  saludoSubtexto: {
    alignSelf: 'stretch',
    color: '#556b58',
    fontSize: 13,
    textAlign: 'center',
  },
  accesos: {
    width: '100%' as DimensionValue,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  empujeEncabezado: { flex: 1, minHeight: 8 },
  acceso: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#e4f1e0',
  },
  accesoTexto: {
    color: '#1e3326',

    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  bloqueSede: { marginTop: 4 },

  listaMascotas: { height: ALTO_CARD_MASCOTA, marginBottom: 0 },
  mascotaCard: {
   width: 106,
   height: ALTO_CARD_MASCOTA,
   padding: 10,
   borderRadius: 14,
   backgroundColor: '#e1f4df',
   borderColor: '#efeeeb',
   borderWidth: 1,
   alignItems: 'center',
  },

  mascotaFotoArea: {
   flex: 1,
   width: '100%',
   alignItems: 'center',
   justifyContent: 'center',
   borderRadius: 10,
   overflow: 'hidden',

   backgroundColor: '#e1f4df',
  },
  mascotaFoto: { width: '100%', height: '100%' },
  mascotaNombre: {
   alignSelf: 'stretch',
   marginTop: 8,
   color: '#0f3e17',
   fontSize: 15,
   fontWeight: 'bold',
   textAlign: 'center',
  },
  mascotaRaza: {
   alignSelf: 'stretch',
   marginTop: 1,
   color: '#4a6152',
   fontSize: 12,
   textAlign: 'center',
  },
  mascotasVacias: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },

  botonQrPortada: { marginVertical: 0, marginTop: 14 },

  qrAdminBloque: {
    marginVertical: 0,
    marginTop: 10,
  },

  qrAdminTitulo: {
    textAlign: 'center',
  },
  qrAdminTexto: {
    textAlign: 'center',
    marginBottom: 16,
  },
  qrAdminMarco: {
    alignSelf: 'stretch',
    width: '100%' as DimensionValue,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  qrAdminSvg: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrAdminSede: {
    marginTop: 12,
    color: '#0f3e17',
    fontSize: 18,
    fontWeight: 'bold',
  },

  qrAdminBotonImprimir: {
    alignSelf: 'stretch',
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
    textAlign: 'center',
  },
  tamanoFotoCita: { width: 56, height: 56 },
  separacionEstado: { marginBottom: 12 },
});
