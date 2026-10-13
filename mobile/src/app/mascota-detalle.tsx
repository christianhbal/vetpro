import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL } from '@/lib/api';
import { descripcionEspecieMascota } from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { obtenerUsuarioActual } from '@/lib/session';
import { turnosEjemploCliente, type TurnoEjemplo } from '@/lib/turnos-ejemplo';

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  edad: number | null;
  foto: string | null;
};

function descripcionMascota(mascota: Mascota): string {
  return [
    descripcionEspecieMascota(mascota.especie, mascota.raza),
    mascota.edad !== null ? `${mascota.edad} años` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Ficha de una mascota con su historial de turnos.
 *
 * La pantalla de Mascotas pasa la mascota por parametro. Se manda solo el id y
 * el nombre porque los parametros de router son strings y no pueden llevar la
 * foto entera (una data URI larga rompe el enlace); el resto se reconstruye
 * aca.
 */
export default function MascotaHistorialScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    nombre?: string;
    especie?: string;
    raza?: string;
    edad?: string;
  }>();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState(false);
  const { width: anchoPantalla, height: altoPantalla } = useWindowDimensions();
  const anchoFotoModal = Math.max(0, Math.min(anchoPantalla * 0.9, 520));
  const altoFotoModal = Math.max(0, Math.min(anchoFotoModal, altoPantalla - 180));

  const mascota = useMemo<Mascota>(
    () => ({
      id: Number(params.id ?? 0),
      nombre: params.nombre ?? 'Mascota',
      especie: params.especie ?? 'Otro',
      raza: params.raza ? params.raza : null,
      edad: params.edad ? Number(params.edad) : null,
      foto,
    }),
    [params.id, params.nombre, params.especie, params.raza, params.edad, foto]
  );

  // La foto no puede viajar por parametro de router: es una data URI larga y el
  // enlace se rompe. Se vuelve a pedir a la API cuando se entra a la ficha.
  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const usuario = await obtenerUsuarioActual();
        if (!usuario) return;
        const response = await fetch(
          `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`
        );
        if (!response.ok) return;
        const lista = await response.json();
        if (!vigente || !Array.isArray(lista)) return;
        const encontrada = lista.find((item: Mascota) => item.id === Number(params.id));
        setFoto(encontrada?.foto ?? null);
      } catch {
        // Sin foto se muestra la huella: no es motivo para cortar la pantalla.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [params.id]);

  // El historial sale de los mismos ejemplos que la pantalla de Turnos, para
  // que los datos no cambien de una pantalla a otra. Solo los del viernes: son
  // los que tienen descripcion, y es justo lo que se quiere ver aca.
  const historial = useMemo(
    () =>
      turnosEjemploCliente([
        {
          id: mascota.id,
          nombre: mascota.nombre,
          especie: mascota.especie,
          raza: mascota.raza,
        },
      ])
        .filter((turno) => turno.atendidoEn !== null)
        .sort((a, b) =>
          a.fecha === b.fecha ? b.hora.localeCompare(a.hora) : b.fecha.localeCompare(a.fecha)
        ),
    [mascota]
  );

  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/mascotas');
  };

  return (
    <AppDrawer title={mascota.nombre} onVolver={volver} etiquetaVolver="Volver a Mascotas">
      <ScrollView
        style={estilos.container}
        contentContainerStyle={[estilos.listPadding, styles.contenido]}
        showsVerticalScrollIndicator={false}
      >
        {/* Encabezado: foto grande y datos. Va arriba de todo, antes del
            historial, para que se sepa de quien es la ficha al entrar. */}
        <View style={styles.encabezado}>
          {mascota.foto ? (
            <Pressable
              onPress={() => setAmpliada(true)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Ampliar la foto de ${mascota.nombre}`}
            >
              <Image
                source={{ uri: mascota.foto }}
                style={styles.fotoGrande}
                resizeMode="contain"
                accessibilityLabel={`Foto de ${mascota.nombre}`}
              />
            </Pressable>
          ) : (
            <View style={[styles.fotoGrande, styles.fotoVaciaFondo]}>
              <Ionicons name="paw-outline" size={52} color="#0f3e17" />
            </View>
          )}
          <Text style={styles.nombre}>{mascota.nombre}</Text>
          <Text style={styles.datos}>{descripcionMascota(mascota)}</Text>
        </View>

        <Text style={estilos.sectionTitle}>Historial</Text>

        {historial.length === 0 ? (
          <View style={styles.vacio}>
            <Ionicons name="calendar-clear-outline" size={26} color="#69806a" />
            <Text style={estilos.cardSubtitle}>Esta mascota todavía no tiene turnos.</Text>
          </View>
        ) : (
          historial.map((turno: TurnoEjemplo) => {
            const estaAbierto = abierto === turno.id;
            return (
              <View key={turno.id} style={styles.tarjeta}>
                <Pressable
                  style={({ pressed }) => [styles.tarjetaCabecera, pressed && estilos.buttonPressed]}
                  onPress={() => setAbierto(estaAbierto ? null : turno.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: estaAbierto }}
                  accessibilityLabel={`${turno.tipo} del ${turno.fecha}, ${
                    estaAbierto ? 'contraer' : 'ver descripcion'
                  }`}
                >
                  <View style={styles.tarjetaTexto}>
                    <Text style={estilos.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                      {turno.tipo}
                    </Text>
                    <Text style={estilos.cardSubtitle}>
                      {turno.fecha.split('-').reverse().join('/')} · {turno.hora} hs · {turno.sede}
                    </Text>
                  </View>
                  <Ionicons
                    name={estaAbierto ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#263b32"
                  />
                </Pressable>

                {/* La descripcion se despliega al apretar. Se muestra sola si no
                    hay nada que colapsar, para que un turno con descripcion
                    nunca quede escondido. */}
                {estaAbierto ? (
                  <View style={styles.descripcion}>
                    <Text style={estilos.cardSubtitle}>
                      {turno.descripcion ?? 'Sin descripción de la visita.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Foto ampliada. Modal y no otra pantalla porque es una vista rapida:
          se abre, se mira y se cierra, sin volver atras en la pila. */}
      <Modal
        visible={ampliada && mascota.foto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setAmpliada(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setAmpliada(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
          />
          <View style={styles.modalFotoContenedor}>
            <Pressable
              style={({ pressed }) => [styles.modalFotoCerrar, pressed && estilos.buttonPressed]}
              onPress={() => setAmpliada(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar foto"
            >
              <Ionicons name="close" size={24} color="#263b32" />
            </Pressable>
            {mascota.foto ? (
              <Image
                source={{ uri: mascota.foto }}
                style={[
                  estilos.petPhoto,
                  // Se pisa el fondo verde de estilos.petPhoto: con contain la
                  // foto no llena el cuadro y el sobrante se veria como marco.
                  { width: anchoFotoModal, height: altoFotoModal, backgroundColor: 'transparent' },
                ]}
                resizeMode="contain"
                accessibilityLabel={`Foto de ${mascota.nombre}`}
              />
            ) : null}
            <Text style={estilos.cardTitle}>{mascota.nombre}</Text>
          </View>
        </View>
      </Modal>
    </AppDrawer>
  );
}

const styles = {
  contenido: { paddingBottom: 32 },
  encabezado: { alignItems: 'center' as const, marginBottom: 8 },
  // SIN backgroundColor: la foto va con resizeMode="contain" y no siempre
  // llena el cuadrado. Con fondo, las fotos apaisadas dejaban barras verdes a
  // los lados y el cuadro se leia como un marco suelto. Sin fondo, el sobrante
  // se ve del color de la pantalla.
  fotoGrande: { width: 132, height: 132, borderRadius: 20 },
  // El estado sin foto si lleva fondo: no hay imagen que ocupe el cuadro.
  fotoVaciaFondo: { backgroundColor: '#e4f1e0' },
  nombre: {
    color: '#0f3e17',
    fontSize: 24,
    fontWeight: 'bold' as const,
    marginTop: 14,
  },
  datos: { color: '#4a6152', fontSize: 15, marginTop: 4, textAlign: 'center' as const },
  tarjeta: {
    backgroundColor: '#e1f4df',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#efeeeb',
    marginBottom: 12,
    overflow: 'hidden' as const,
  },
  tarjetaCabecera: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 14,
  },
  tarjetaTexto: { flex: 1 },
  descripcion: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#d8e3d5',
  },
  vacio: { alignItems: 'center' as const, paddingVertical: 32, gap: 10 },
  // Contenedor del modal: centra la foto y le da fondo propio para que se
  // distinga del fondo oscurecido del backdrop.
  modalFotoContenedor: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#fffefc',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    gap: 12,
  },
  modalFotoCerrar: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    zIndex: 1,
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 20,
    backgroundColor: '#f2f9f1',
  },
};