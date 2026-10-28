import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { estilos } from '@/lib/estilos';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { ESPECIES_MASCOTA, ESPECIE_OTRO, SEXOS_MASCOTA, type SexoMascota } from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';

export default function NuevaMascota() {
  const [nombre, setNombre] = useState('');
  const [especie, setEspecie] = useState('');
  const [otraEspecie, setOtraEspecie] = useState('');
  const [raza, setRaza] = useState('');
  const [sexo, setSexo] = useState<SexoMascota | ''>('');
  const [edad, setEdad] = useState('');
  const [foto, setFoto] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Nombre de la mascota recien registrada, para el aviso de exito.
  const [mascotaGuardada, setMascotaGuardada] = useState<string | null>(null);

  // Si se entra por un link directo no hay historial, asi que caemos a Mascotas.
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

    const edadNumero = edad.trim() ? Number(edad) : null;
    if (!nombre.trim() || !especie) {
      setMensaje('Completa el nombre y la especie.');
      return;
    }
    if (especie === ESPECIE_OTRO && !otraEspecie.trim()) {
      setMensaje('Decinos qué tipo de animal es.');
      return;
    }
    if (!sexo) {
      setMensaje('Elegí si tu mascota es macho o hembra.');
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

      if (usuario.esAdmin) {
        router.replace('/app');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/mascotas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usuario.accessToken}` },
        body: JSON.stringify({
          nombre: nombre.trim(),
          especie: especie === ESPECIE_OTRO ? otraEspecie.trim() : especie,
          raza: raza.trim() || null,
          sexo,
          edad: edadNumero,
          foto,
          userId: usuario.id,
        }),
      });
      const resultado = await response.json();

      if (!response.ok) {
        setMensaje(resultado.message ?? 'No se pudo registrar la mascota.');
        return;
      }

      // La navegacion se hace al cerrar el aviso: si se cambia de pantalla
      // antes, el componente se desmonta y el modal nunca llega a verse.
      setMascotaGuardada(nombre.trim());
    } catch (error) {
      setMensaje(apiUnreachableMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppDrawer title="Agregar mascota" onVolver={volver} etiquetaVolver="Volver a Mascotas">
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
                  <Text style={[styles.especieTexto, seleccionada && styles.especieTextoSeleccionado]}>
                    {opcion}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Va arriba de Sexo y Raza: es el desglose del boton "Otro", asi que
            tiene que quedar pegado a la pregunta que lo abre. */}
        {especie === ESPECIE_OTRO ? (
          <View style={styles.bloque}>
            <Text style={styles.label}>¿Qué animal es?</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. Pez"
              placeholderTextColor="#8b978c"
              value={otraEspecie}
              onChangeText={setOtraEspecie}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Tipo de animal"
            />
          </View>
        ) : null}

        <View style={styles.bloque}>
          <Text style={styles.label}>Sexo</Text>
          <View style={styles.filaEspecies}>
            {SEXOS_MASCOTA.map((opcion) => {
              const seleccionada = sexo === opcion;
              return (
                <Pressable
                  key={opcion}
                  onPress={() => setSexo(opcion)}
                  accessibilityRole="radio"
                  accessibilityLabel={opcion}
                  accessibilityState={{ selected: seleccionada }}
                  style={({ pressed }) => [
                    styles.especieOpcion,
                    seleccionada && styles.especieOpcionSeleccionada,
                    pressed && estilos.buttonPressed,
                  ]}
                >
                  <Ionicons
                    name={opcion === 'Macho' ? 'male-outline' : 'female-outline'}
                    size={17}
                    color={seleccionada ? '#0f3e17' : '#556b58'}
                  />
                  <Text style={[styles.especieTexto, seleccionada && styles.especieTextoSeleccionado]}>
                    {opcion}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
                    accessibilityLabel="Foto elegida"
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
          accessibilityLabel="Registrar mascota"
          accessibilityState={{ busy: isSubmitting }}
        >
          <Text style={styles.guardarTexto}>
            {isSubmitting ? 'Guardando...' : 'Registrar mascota'}
          </Text>
        </Pressable>
      </ScrollView>

      <AvisoExito
        visible={mascotaGuardada !== null}
        titulo="¡Mascota registrada!"
        subtitulo={
          mascotaGuardada !== null
            ? `${mascotaGuardada} ya está en tu lista de mascotas.`
            : undefined
        }
        etiquetaBoton="Cerrar el aviso de mascota registrada"
        onCerrar={() => {
          setMascotaGuardada(null);
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 7,
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
};