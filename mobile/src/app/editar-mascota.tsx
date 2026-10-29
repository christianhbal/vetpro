import { fechaNacimientoValida } from '@/lib/datos';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import {
  dividirEspecieMascota,
  esSexoMascota,
  type SexoMascota,
} from '@/lib/datos';
import { useSesion } from '@/lib/sesion-context';
import { useRecordatorios } from '@/lib/recordatorios';

export default function EditarMascota() {
  const sincronizarRecordatorios = useRecordatorios();
  const { usuario: usuarioSesion } = useSesion();
  const params = useLocalSearchParams<{
    id?: string;
    nombre?: string;
    especie?: string;
    raza?: string;
    sexo?: string;
    fechaNacimiento?: string;
  }>();
  const id = Number(params.id ?? 0);

  const [nombre, setNombre] = useState(params.nombre ?? '');
  const inicial = useMemo(
    () => dividirEspecieMascota(params.especie ?? '', params.raza ?? ''),
    [params.especie, params.raza]
  );
  // Solo para mostrar. La especie no se manda en el PATCH, asi que no hace
  // falta un estado editable: sale de dividirEspecieMascota.
  const datosAnimal = inicial.otra || inicial.seleccion || 'Sin definir';
  // La raza si se edita: es el unico de los tres que el usuario puede haber
  // dejado en blanco al crearla y querer completar despues.
  const [raza, setRaza] = useState(params.raza ?? '');
  // El sexo solo se muestra, pero se relee de la API al entrar para que no se vea
  // viejo si se entro por un link directo.
  const [sexoDatos, setSexoDatos] = useState<SexoMascota | ''>(
    esSexoMascota(params.sexo) ? params.sexo : ''
  );
  const sexo = sexoDatos;
  const [fechaNacimiento, setFechaNacimiento] = useState(params.fechaNacimiento ?? '');
  const [foto, setFoto] = useState<string | null>(null);
  const [cargada, setCargada] = useState(false);
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
        const usuario = usuarioSesion;
        if (!usuario) return;
        const response = await fetch(
          `${API_BASE_URL}/api/mascotas?userId=${encodeURIComponent(String(usuario.id))}`,
          { headers: { Authorization: `Bearer ${usuario.accessToken}` } }
        );
        if (!response.ok) throw new Error('No se pudo cargar la mascota.');
        const lista: unknown = await response.json();
        if (!vigente) return;
        if (!Array.isArray(lista)) throw new Error('La API devolvió datos inválidos.');
        const encontrada = lista.find(
          (item) => typeof item === 'object' && item !== null && 'id' in item && item.id === id
        ) as { nombre: string; raza: string | null; fechaNacimiento: string; foto: string | null; sexo: string | null } | undefined;
        if (!encontrada) throw new Error('No se encontró la mascota.');
        setNombre(encontrada.nombre);
        setRaza(encontrada.raza ?? '');
        setFechaNacimiento(encontrada.fechaNacimiento);
        setCargada(true);
        setFoto(encontrada?.foto ?? null);
        if (esSexoMascota(encontrada?.sexo)) setSexoDatos(encontrada.sexo);
      } catch (error) {
        if (vigente) setMensaje(error instanceof Error ? error.message : 'No se pudo cargar la mascota.');
      }
    })();
    return () => {
      vigente = false;
    };
  }, [id, usuarioSesion]);

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
    if (!cargada) { setMensaje('Espera a que se carguen los datos de la mascota.'); return; }
    setMensaje('');

    if (!Number.isInteger(id) || id <= 0) {
      setMensaje('No se pudo identificar la mascota.');
      return;
    }

    if (!nombre.trim()) {
      setMensaje('El nombre no puede quedar vacío.');
      return;
    }
    if (!fechaNacimientoValida(fechaNacimiento.trim())) {
      setMensaje('Ingresá una fecha de nacimiento válida en formato AAAA-MM-DD.');
      return;
    }

    setIsSubmitting(true);
    try {
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mascotas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usuario.accessToken}` },
// Solo van los campos que esta pantalla deja cambiar. El PATCH es parcial, asi
      // que animal, sexo y raza se quedan como estan: no se mandan y el backend
      // no los toca.
      body: JSON.stringify({
        nombre: nombre.trim(),
        raza: raza.trim() || null,
        fechaNacimiento: fechaNacimiento.trim(),
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
      const usuario = usuarioSesion;
      if (!usuario) {
        router.replace('/');
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/mascotas/${id}?userId=${encodeURIComponent(String(usuario.id))}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${usuario.accessToken}` } }
      );

      if (!response.ok) {
        const resultado = await response.json().catch(() => null);
        setConfirmandoBorrado(false);
        setMensaje(resultado?.message ?? 'No se pudo eliminar la mascota.');
        return;
      }

      void sincronizarRecordatorios();
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
        <View style={styles.fijoBloque}>
          <View style={styles.fijoFila}>
            <Text style={styles.fijoEtiqueta}>Animal</Text>
            <Text style={styles.fijoValor}>{datosAnimal}</Text>
          </View>
          <View style={styles.fijoFila}>
            <Text style={styles.fijoEtiqueta}>Sexo</Text>
            <Text style={styles.fijoValor}>{sexo || 'Sin definir'}</Text>
          </View>
        </View>

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

        <View style={styles.bloque}>
          <Text style={styles.label}>Fecha de nacimiento</Text>
          <TextInput
            style={styles.input}
            placeholder="AAAA-MM-DD"
            placeholderTextColor="#8b978c"
            value={fechaNacimiento}
            onChangeText={setFechaNacimiento}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
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

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 26,
  },
  bloque: { marginBottom: 10 },
  // Bloque de solo lectura: los datos que no se cambian desde esta pantalla.
  fijoBloque: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe9dc',
    backgroundColor: '#f3f7f1',
  },
  fijoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 3,
  },
  fijoEtiqueta: { color: '#69746a', fontSize: 14 },
  fijoValor: { flex: 1, color: '#0f3e17', fontSize: 14, fontWeight: '600', textAlign: 'right' },
  label: {
    marginBottom: 6,
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600',
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
  filaFoto: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fotoMarco: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#f3f7f1',
    overflow: 'hidden',
  },
  foto: { width: 76, height: 76 },
  quitarFoto: { position: 'absolute', top: 2, right: 2 },
  fotoBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  fotoBotonTexto: { color: '#0f3e17', fontSize: 14, fontWeight: '600' },
  mensajeError: {
    marginTop: 12,
    color: '#a32828',
    fontSize: 13,
    lineHeight: 19,
  },
  guardar: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  guardarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' },
  // Mismos valores que "Eliminar sede": es la misma accion, borrar algo.
  eliminar: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#d3a179',
    borderRadius: 12,
    backgroundColor: '#f7ede6',
  },
  eliminarTexto: { color: '#8a5324', fontSize: 15, fontWeight: '600' },
  eliminarConfirmar: { backgroundColor: '#a32828' },
});
