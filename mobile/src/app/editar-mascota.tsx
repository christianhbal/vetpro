import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import {
  dividirEspecieMascota,
  ESPECIES_MASCOTA,
  ESPECIE_OTRO,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

/**
 * Edicion de una mascota. Es la misma pantalla que "Agregar mascota" con los
 * campos ya cargados y un PATCH en vez de un POST.
 *
 * La foto no viaja por parametro de router: es una data URI larga y rompe el
 * enlace. Se vuelve a pedir a la API cuando se entra a la pantalla.
 */
export default function EditarMascota() {
  const params = useLocalSearchParams<{
    id?: string;
    nombre?: string;
    especie?: string;
    raza?: string;
    edad?: string;
  }>();
  const id = Number(params.id ?? 0);

  const [nombre, setNombre] = useState(params.nombre ?? '');
  const inicial = useMemo(
    () => dividirEspecieMascota(params.especie ?? '', params.raza ?? ''),
    [params.especie, params.raza]
  );
  const [especie, setEspecie] = useState(inicial.seleccion);
  const [otraEspecie, setOtraEspecie] = useState(inicial.otra);
  const [raza, setRaza] = useState(params.raza ?? '');
  const [edad, setEdad] = useState(params.edad ?? '');
  const [foto, setFoto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guardada, setGuardada] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [borrada, setBorrada] = useState<string | null>(null);

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
        const lista: unknown = await response.json();
        if (!vigente || !Array.isArray(lista)) return;
        const encontrada = lista.find(
          (item) => typeof item === 'object' && item !== null && 'id' in item && item.id === id
        ) as { foto?: string | null } | undefined;
        setFoto(encontrada?.foto ?? null);
      } catch {
        // Sin foto se muestra la huella: no es motivo para cortar la pantalla.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [id]);

  const volver = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/mascotas');
  };

  const elegirFoto = async () => {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.65,
        base64: true,
      });
      if (resultado.canceled) return;

      const imagen = resultado.assets[0];
      if (!imagen.base64) {
        setMensaje('No se pudo leer la foto. Elige otra imagen.');
        return;
      }

      setFoto(`data:${imagen.mimeType || 'image/jpeg'};base64,${imagen.base64}`);
      setMensaje('');
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo abrir la galería.');
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setMensaje('');

    if (!Number.isInteger(id) || id <= 0) {
      setMensaje('No se pudo identificar la mascota.');
      return;
    }

    const edadNumero = edad.trim() ? Number(edad) : null;
    if (!nombre.trim() || !especie) {
      setMensaje('Completa el nombre y la especie.');
      return;
    }
    if (especie === ESPECIE_OTRO && !otraEspecie.trim()) {
      setMensaje('Decinos qué tipo de animal es.');
      return;
    }
    if (
      edadNumero !== null &&
      (!Number.isInteger(edadNumero) || edadNumero < 0 || edadNumero > 200)
    ) {
      setMensaje('La edad debe ser un número entero entre 0 y 200.');
      return;
    }

    setIsSubmitting(true);
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mascotas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          especie: especie === ESPECIE_OTRO ? otraEspecie.trim() : especie,
          raza: raza.trim() || null,
          edad: edadNumero,
          foto: foto ?? null,
          userId: usuario.id,
        }),
      });
      const resultado = await response.json();

      if (!response.ok) {
        setMensaje(resultado.message ?? 'No se pudo actualizar la mascota.');
        return;
      }

      // La navegacion se hace al cerrar el aviso: si se cambia de pantalla
      // antes, el componente se desmonta y el modal nunca llega a verse.
      setGuardada(nombre.trim());
    } catch (error) {
      setMensaje(apiUnreachableMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const eliminar = async () => {
    if (borrando) return;

    setBorrando(true);
    try {
      const usuario = await obtenerUsuarioActual();
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas/${id}?userId=${encodeURIComponent(String(usuario.id))}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const resultado = await response.json().catch(() => null);
        setConfirmandoBorrado(false);
        setMensaje(resultado?.message ?? 'No se pudo eliminar la mascota.');
        return;
      }

      setConfirmandoBorrado(false);
      setBorrada(nombre.trim() || 'La mascota');
    } catch (error) {
      setConfirmandoBorrado(false);
      setMensaje(apiUnreachableMessage(error));
    } finally {
      setBorrando(false);
    }
  };

  return (
    <AppDrawer title="Editar mascota" onVolver={volver} etiquetaVolver="Volver">
      <ScrollView
        style={estilos.container}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.bloque}>
          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Luna"
            placeholderTextColor="#8b978c"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.bloque}>
          <Text style={styles.label}>Animal</Text>
          <View style={styles.filaEspecies}>
            {ESPECIES_MASCOTA.map((opcion) => {
              const seleccionada = especie === opcion;
              return (
                <Pressable
                  key={opcion}
                  onPress={() => setEspecie(opcion)}
                  accessibilityRole="radio"
                  accessibilityLabel={opcion}
                  accessibilityState={{ selected: seleccionada }}
                  style={({ pressed }) => [
                    styles.especieOpcion,
                    seleccionada && styles.especieOpcionSeleccionada,
                    pressed && estilos.buttonPressed,
                  ]}
                >
                  <Text
                    style={[styles.especieTexto, seleccionada && styles.especieTextoSeleccionado]}
                  >
                    {opcion}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {especie === ESPECIE_OTRO ? (
          <View style={styles.bloque}>
            <Text style={styles.label}>¿Qué animal es?</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Canguro"
              placeholderTextColor="#8b978c"
              value={otraEspecie}
              onChangeText={setOtraEspecie}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Tipo de animal"
            />
          </View>
        ) : null}

        <View style={styles.filaCampos}>
          <View style={[styles.bloque, styles.columnaAncha]}>
            <Text style={styles.label}>Raza (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. mestizo"
              placeholderTextColor="#8b978c"
              value={raza}
              onChangeText={setRaza}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          <View style={styles.columnaAngosta}>
            <Text style={styles.label}>Edad (años)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. 2"
              placeholderTextColor="#8b978c"
              value={edad}
              onChangeText={setEdad}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>
        </View>

        <View style={styles.bloque}>
          <Text style={styles.label}>Foto (opcional)</Text>
          <View style={styles.filaFoto}>
            <View style={styles.fotoMarco}>
              {foto ? (
                <>
                  <Image
                    source={{ uri: foto }}
                    style={styles.foto}
                    resizeMode="contain"
                    accessibilityLabel="Foto de la mascota"
                  />
                  <Pressable
                    style={styles.quitarFoto}
                    onPress={() => setFoto(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Quitar foto"
                  >
                    <Ionicons name="close-circle" size={22} color="#a12d2d" />
                  </Pressable>
                </>
              ) : (
                <Ionicons name="paw-outline" size={26} color="#8b978c" />
              )}
            </View>

            <Pressable
              style={({ pressed }) => [styles.fotoBoton, pressed && estilos.buttonPressed]}
              onPress={elegirFoto}
              accessibilityRole="button"
              accessibilityLabel={foto ? 'Cambiar foto de mascota' : 'Elegir foto de mascota'}
            >
              <Ionicons name="image-outline" size={18} color="#0f3e17" />
              <Text style={styles.fotoBotonTexto}>{foto ? 'Cambiar foto' : 'Elegir foto'}</Text>
            </Pressable>
          </View>
        </View>

        {mensaje ? (
          <Text accessibilityRole="alert" style={styles.mensajeError}>
            {mensaje}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.guardar,
            pressed && estilos.buttonPressed,
            isSubmitting && estilos.buttonPressed,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Guardar cambios de la mascota"
          accessibilityState={{ busy: isSubmitting }}
        >
          <Text style={styles.guardarTexto}>
            {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.eliminar, pressed && estilos.buttonPressed]}
          onPress={() => setConfirmandoBorrado(true)}
          disabled={isSubmitting || borrando}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar a ${nombre.trim() || 'la mascota'}`}
        >
          <Ionicons name="trash-outline" size={18} color="#a32828" />
          <Text style={styles.eliminarTexto}>Eliminar mascota</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={confirmandoBorrado}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmandoBorrado(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setConfirmandoBorrado(false)}
            accessibilityRole="button"
            accessibilityLabel="Cancelar la eliminación"
          />
          <View style={estilos.modalCard}>
            <Text style={estilos.modalTitle}>¿Eliminar mascota?</Text>
            <Text style={estilos.modalText}>
              Se borra {nombre.trim() || 'la mascota'} y no se puede recuperar.
            </Text>
            <View style={estilos.modalActions}>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonNeutral]}
                onPress={() => setConfirmandoBorrado(false)}
                accessibilityRole="button"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonPrimary, styles.eliminarConfirmar]}
                onPress={eliminar}
                disabled={borrando}
                accessibilityRole="button"
                accessibilityState={{ busy: borrando }}
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  {borrando ? 'Eliminando...' : 'Sí, eliminar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AvisoExito
        visible={guardada !== null}
        titulo="¡Mascota actualizada!"
        subtitulo={guardada !== null ? `Guardamos los cambios de ${guardada}.` : undefined}
        etiquetaBoton="Cerrar el aviso de mascota actualizada"
        onCerrar={() => {
          setGuardada(null);
          volver();
        }}
      />
      <AvisoExito
        visible={borrada !== null}
        titulo="¡Mascota eliminada!"
        subtitulo={borrada !== null ? `Ya no tenés a ${borrada} en tu lista.` : undefined}
        etiquetaBoton="Cerrar el aviso de mascota eliminada"
        onCerrar={() => {
          setBorrada(null);
          router.replace('/mascotas');
        }}
      />
    </AppDrawer>
  );
}

const styles = {
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 26,
  },
  bloque: { marginBottom: 10 },
  label: {
    marginBottom: 6,
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
    fontSize: 15,
    color: '#1e3326',
  },
  filaCampos: { flexDirection: 'row' as const, gap: 8 },
  columnaAncha: { flex: 1.5, marginBottom: 10 },
  columnaAngosta: { flex: 1, marginBottom: 10 },
  filaEspecies: { flexDirection: 'row' as const, gap: 6 },
  especieOpcion: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  especieOpcionSeleccionada: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  especieTexto: { color: '#1e3326', fontSize: 14, fontWeight: '500' as const },
  especieTextoSeleccionado: { color: '#0f3e17', fontWeight: 'bold' as const },
  filaFoto: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  fotoMarco: {
    width: 76,
    height: 76,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#f3f7f1',
    overflow: 'hidden' as const,
  },
  foto: { width: 76, height: 76 },
  quitarFoto: { position: 'absolute' as const, top: 2, right: 2 },
  fotoBoton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  fotoBotonTexto: { color: '#0f3e17', fontSize: 14, fontWeight: '600' as const },
  mensajeError: {
    marginTop: 12,
    color: '#a32828',
    fontSize: 13,
    lineHeight: 19,
  },
  guardar: {
    alignItems: 'center' as const,
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  guardarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' as const },
  eliminar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 10,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#e0b3b3',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  eliminarTexto: { color: '#a32828', fontSize: 15, fontWeight: '600' as const },
  eliminarConfirmar: { backgroundColor: '#a32828' },
};
