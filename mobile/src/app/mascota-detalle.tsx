import { useCallback, useState } from 'react';
import { StyleSheet, Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { descripcionEspecieMascota, edadDesdeNacimiento } from '@/lib/datos';
import { estilos } from '@/lib/estilos';
import { useSesion } from '@/lib/sesion-context';
import type { TurnoGuardado } from '@/lib/datos';

type TurnoHistorial = TurnoGuardado & { atendidoEn: string | null; ocultoEnAgenda?: boolean };

type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  raza: string | null;
  sexo: string | null;
  fechaNacimiento: string;
  foto: string | null;
};

function descripcionMascota(mascota: Mascota): string {
  return [
    descripcionEspecieMascota(mascota.especie, mascota.raza),
    // Solo se muestra aca y no en la lista de Mascotas: eldueño lo busca cuando
    // abre la ficha, no cuando esta recorriendo los nombres.
    mascota.sexo,
    edadDesdeNacimiento(mascota.fechaNacimiento) !== null ? `${edadDesdeNacimiento(mascota.fechaNacimiento)} años` : null,
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
  const { usuario: usuarioSesion } = useSesion();
  const params = useLocalSearchParams<{
    id?: string;
    nombre?: string;
    especie?: string;
    raza?: string;
    sexo?: string;
    fechaNacimiento?: string;
  }>();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [datos, setDatos] = useState<Mascota | null>(null);
  const [historial, setHistorial] = useState<TurnoHistorial[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState('');
  const [ampliada, setAmpliada] = useState(false);
  const { width: anchoPantalla, height: altoPantalla } = useWindowDimensions();
  const anchoFotoModal = Math.max(0, Math.min(anchoPantalla * 0.9, 520));
  const altoFotoModal = Math.max(0, Math.min(anchoFotoModal, altoPantalla - 180));

  const id = Number(params.id ?? 0);

  // Lo que se paso por parametro es una foto del momento en que se abrio la
  // pantalla: si edita la mascota y vuelve, esos valores estan viejos. Se
  // vuelven a pedir en cada foco, asi que lo guardado gana sobre el parametro
  // apenas llega. Antes solo se refrescaba la foto, por eso el nombre y la
  // raza no cambiaban hasta salir y volver a entrar.
  const [desdeParams] = useState<Mascota>(() => ({
    id,
    nombre: params.nombre ?? 'Mascota',
    especie: params.especie ?? 'Otro',
    raza: params.raza ? params.raza : null,
    sexo: params.sexo ? params.sexo : null,
    fechaNacimiento: params.fechaNacimiento ?? '',
    foto: null,
  }));

  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      setCargandoHistorial(true);
      setErrorHistorial('');
      void (async () => {
        try {
          const usuario = usuarioSesion;
          if (!usuario) { router.replace('/'); return; }
          const response = await fetch(
            `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`,
          { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
          );
          if (!response.ok) throw new Error('No se pudieron cargar los datos de la mascota.');
          const lista: unknown = await response.json();
          if (!vigente) return;
          if (!Array.isArray(lista)) throw new Error('La API devolvió datos inválidos.');
          const encontrada = lista.find((item) => {
            if (typeof item !== 'object' || item === null || !('id' in item)) return false;
            return (item as { id: unknown }).id === id;
          });
          if (!vigente) return;
          if (!encontrada) throw new Error('No se encontró la mascota.');
          setDatos(encontrada as Mascota);
          const respuestaTurnos = await fetch(
            `${API_BASE_URL}/api/turnos?userId=${encodeURIComponent(String(usuario.id))}`,
            { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
          );
          if (!respuestaTurnos.ok) throw new Error('No se pudo cargar el historial.');
          const turnos: unknown = await respuestaTurnos.json();
          if (!Array.isArray(turnos)) throw new Error('La API devolvió un historial inválido.');
          if (vigente) setHistorial((turnos as TurnoHistorial[])
            .filter((turno) => turno.mascotaId === id && turno.atendidoEn !== null && !turno.ocultoEnAgenda)
            .sort((a, b) => a.fecha === b.fecha ? b.hora.localeCompare(a.hora) : b.fecha.localeCompare(a.fecha)));

        } catch (error) {
          if (vigente) { setHistorial([]); setErrorHistorial(error instanceof TypeError ? apiUnreachableMessage(error) : error instanceof Error ? error.message : 'No se pudo cargar el historial.'); }
        } finally {
          if (vigente) setCargandoHistorial(false);
        }
      })();
      return () => {
        vigente = false;
      };
    }, [id, usuarioSesion])
  );

  const mascota = datos ?? desdeParams;

  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/mascotas');
  };

  const estilosAdaptados = StyleSheet.create({
    fotoAmpliada: { width: anchoFotoModal, height: altoFotoModal, backgroundColor: 'transparent' },
  });

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

          <Pressable
            style={({ pressed }) => [styles.editar, pressed && estilos.buttonPressed]}
            onPress={() =>
              router.push({
                pathname: '/editar-mascota',
                params: {
                  id: String(mascota.id),
                  nombre: mascota.nombre,
                  especie: mascota.especie,
                  raza: mascota.raza ?? '',
                  sexo: mascota.sexo ?? '',
                  fechaNacimiento: mascota.fechaNacimiento,
                },
              })
            }
            accessibilityRole="link"
            accessibilityLabel={`Editar los datos de ${mascota.nombre}`}
          >
            <Ionicons name="create-outline" size={18} color="#0f3e17" />
            <Text style={styles.editarTexto}>Editar</Text>
          </Pressable>
        </View>

        <Text style={estilos.sectionTitle}>Historial</Text>

        {historial.length === 0 ? (
          <View style={styles.vacio}>
            <Ionicons name="calendar-clear-outline" size={26} color="#69806a" />
            <Text style={estilos.cardSubtitle}>{cargandoHistorial ? 'Cargando historial...' : errorHistorial || 'Esta mascota todavía no tiene turnos atendidos.'}</Text>
          </View>
        ) : (
          historial.map((turno: TurnoHistorial) => {
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
                  estilosAdaptados.fotoAmpliada,
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

const styles = StyleSheet.create({
  contenido: { paddingBottom: 32 },
  encabezado: { alignItems: 'center', marginBottom: 8 },
  // SIN backgroundColor: la foto va con resizeMode="contain" y no siempre
  // llena el cuadrado. Con fondo, las fotos apaisadas dejaban barras verdes a
  // los lados y el cuadro se leia como un marco suelto. Sin fondo, el sobrante
  // se ve del color de la pantalla.
  fotoGrande: { width: 132, height: 132, borderRadius: 20 },
  // El estado sin foto si lleva fondo: no hay imagen que ocupe el cuadro.
  fotoVaciaFondo: {
   backgroundColor: '#e4f1e0',
   alignItems: 'center',
   justifyContent: 'center',
  },
  nombre: {
    color: '#0f3e17',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 14,
  },
  datos: { color: '#4a6152', fontSize: 15, marginTop: 4, textAlign: 'center' },
  editar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  editarTexto: { color: '#0f3e17', fontSize: 14, fontWeight: '600' },
  tarjeta: {
    backgroundColor: '#e1f4df',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#efeeeb',
    marginBottom: 12,
    overflow: 'hidden',
  },
  tarjetaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
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
  vacio: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  // Contenedor del modal: centra la foto y le da fondo propio para que se
  // distinga del fondo oscurecido del backdrop.
  modalFotoContenedor: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffefc',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    gap: 12,
  },
  modalFotoCerrar: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#f2f9f1',
  },
});