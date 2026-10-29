import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { useSesion } from '@/lib/sesion-context';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { estilos } from '@/lib/estilos';

type Dia = {
  clave: string;
  corto: string;
  largo: string;
};

const DIAS: Dia[] = [
  { clave: 'lun', corto: 'L', largo: 'Lunes' },
  { clave: 'mar', corto: 'M', largo: 'Martes' },
  { clave: 'mie', corto: 'X', largo: 'Miércoles' },
  { clave: 'jue', corto: 'J', largo: 'Jueves' },
  { clave: 'vie', corto: 'V', largo: 'Viernes' },
  { clave: 'sab', corto: 'S', largo: 'Sábado' },
  { clave: 'dom', corto: 'D', largo: 'Domingo' },
];

type Sede = {
  id: number;
  nombre: string;
  direccion: string;
  dias: string[];
  horaDesde: string;
  horaHasta: string;
};

const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'];


function esHoraValida(valor: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor.trim());
}

function horaComoMinutos(valor: string): number {
  const [horas, minutos] = valor.split(':').map(Number);
  return horas * 60 + minutos;
}

function resumenDias(dias: string[]): string {
  const nombres = DIAS.filter((dia) => dias.includes(dia.clave)).map((dia) => dia.largo);
  if (nombres.length === 0) return 'Sin días seleccionados';
  if (nombres.length === 1) return nombres[0];
  return `${nombres[0]} a ${nombres[nombres.length - 1]}`;
}

export default function AdminSedesScreen() {
  const { usuario: usuarioSesion } = useSesion();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorLista, setErrorLista] = useState('');

  const cargarSedes = useCallback(async () => {
    setCargando(true);
    setErrorLista('');
    try {
      const usuario = usuarioSesion;
      if (!usuario?.esAdmin) { router.replace('/app'); return; }
      const response = await fetch(`${API_BASE_URL}/api/sedes`, { headers: { Authorization: `Bearer ${usuario.accessToken}` } });
      const resultado = await response.json();
      if (!response.ok) throw new Error(resultado.message ?? 'No se pudieron cargar las sedes.');
      setSedes(resultado);
    } catch (error) {
      setErrorLista(error instanceof TypeError ? apiUnreachableMessage(error) : error instanceof Error ? error.message : 'No se pudieron cargar las sedes.');
    } finally { setCargando(false); }
  }, [usuarioSesion]);

  useFocusEffect(useCallback(() => { void cargarSedes(); }, [cargarSedes]));

  const [modalAbierto, setModalAbierto] = useState(false);
  const [sedeEnEdicion, setSedeEnEdicion] = useState<Sede | null>(null);
  const [sedeAEliminar, setSedeAEliminar] = useState<Sede | null>(null);
  // Nombre de la sede recien guardada, para el aviso de exito.
  const [sedeGuardada, setSedeGuardada] = useState<{ nombre: string; editando: boolean } | null>(
    null
  );
  // Avisos de eliminacion: exito y error, separados del formulario.
  const [sedeEliminada, setSedeEliminada] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState('');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [dias, setDias] = useState<string[]>([]);
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [error, setError] = useState('');

  const abrirNueva = () => {
    setSedeEnEdicion(null);
    setNombre('');
    setDireccion('');
    setDias([...DIAS_SEMANA]);
    setHoraDesde('');
    setHoraHasta('');
    setError('');
    setModalAbierto(true);
  };

  const abrirEdicion = (sede: Sede) => {
    setSedeEnEdicion(sede);
    setNombre(sede.nombre);
    setDireccion(sede.direccion);
    setDias(sede.dias);
    setHoraDesde(sede.horaDesde);
    setHoraHasta(sede.horaHasta);
    setError('');
    setModalAbierto(true);
  };

  const cerrarEdicion = () => setModalAbierto(false);

  const alternarDia = (clave: string) => {
    setDias((actuales) =>
      actuales.includes(clave) ? actuales.filter((dia) => dia !== clave) : [...actuales, clave]
    );
  };

  const guardar = async () => {
    if (guardando) return;
    if (!nombre.trim() || !direccion.trim()) {
      setError('Completa el nombre y la dirección de la sede.');
      return;
    }
    if (nombre.trim().length < 3) {
      setError('El nombre de la sede debe tener al menos 3 caracteres.');
      return;
    }
    const normalizado = nombre.trim().toLowerCase();
    const duplicada = sedes.some(
      (sede) => sede.nombre.toLowerCase() === normalizado && sede.id !== sedeEnEdicion?.id
    );
    if (duplicada) {
      setError(`Ya existe otra sede con el nombre ${nombre.trim()}.`);
      return;
    }
    if (dias.length === 0) {
      setError('Elegí al menos un día de atención.');
      return;
    }
    if (!esHoraValida(horaDesde) || !esHoraValida(horaHasta)) {
      setError('Los horarios usan el formato HH:mm, por ejemplo 09:30.');
      return;
    }
    if (horaComoMinutos(horaHasta) <= horaComoMinutos(horaDesde)) {
      setError('El horario de cierre tiene que ser posterior al de apertura.');
      return;
    }

    setGuardando(true);
    try {
      const usuario = usuarioSesion;
      if (!usuario?.esAdmin) { router.replace('/app'); return; }
      const editando = sedeEnEdicion !== null;
      const response = await fetch(`${API_BASE_URL}/api/admin/sedes${editando ? `/${sedeEnEdicion.id}` : ''}`, {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${usuario.accessToken}` },
        body: JSON.stringify({ nombre: nombre.trim(), direccion: direccion.trim(), dias, horaDesde: horaDesde.trim(), horaHasta: horaHasta.trim() }),
      });
      const resultado = await response.json();
      if (!response.ok) throw new Error(resultado.message ?? 'No se pudo guardar la sede.');
      cerrarEdicion();
      await cargarSedes();
      setSedeGuardada({ nombre: resultado.nombre, editando });
    } catch (error) {
      setError(error instanceof TypeError ? apiUnreachableMessage(error) : error instanceof Error ? error.message : 'No se pudo guardar la sede.');
    } finally { setGuardando(false); }
  };

  const confirmarEliminacion = async () => {
    if (!sedeAEliminar || guardando) return;
    const nombreSede = sedeAEliminar.nombre;
    setGuardando(true);
    setErrorEliminar('');
    try {
      const usuario = usuarioSesion;
      if (!usuario?.esAdmin) { router.replace('/app'); return; }
      const response = await fetch(`${API_BASE_URL}/api/admin/sedes/${sedeAEliminar.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${usuario.accessToken}` } });
      if (!response.ok) {
        const resultado = await response.json();
        throw new Error(resultado.message ?? 'No se pudo eliminar la sede.');
      }
      setSedeAEliminar(null);
      cerrarEdicion();
      await cargarSedes();
      setSedeEliminada(nombreSede);
    } catch (error) {
      setSedeAEliminar(null);
      setErrorEliminar(error instanceof TypeError ? apiUnreachableMessage(error) : error instanceof Error ? error.message : 'Inténtalo nuevamente.');
    } finally { setGuardando(false); }
  };

  return (
    <AppDrawer title="Sedes">
      <View style={styles.pantalla}>
        <FlatList
          data={sedes}
          refreshing={cargando}
          onRefresh={() => void cargarSedes()}
          ListEmptyComponent={cargando ? <ActivityIndicator color="#0f3e17" /> : <Text style={estilos.cardSubtitle}>{errorLista || 'Todavía no hay sedes.'}</Text>}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={estilos.listPadding}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [estilos.cardVertical, pressed && estilos.buttonPressed]}
              onPress={() => abrirEdicion(item)}
              accessibilityRole="button"
              accessibilityLabel={`Editar la sede ${item.nombre}`}
            >
              <View style={styles.sedeFila}>
                <View style={styles.sedeIcono}>
                  <Ionicons name="location" size={20} color="#0f3e17" />
                </View>
                <View style={styles.sedeTexto}>
                  <Text style={estilos.cardTitle}>{item.nombre}</Text>
                  <Text style={estilos.cardSubtitle}>{item.direccion}</Text>
                  <View style={styles.horarioFila}>
                    <Text style={styles.horarioTexto}>
                      {resumenDias(item.dias)} · {item.horaDesde} a {item.horaHasta}
                    </Text>
                  </View>
                </View>
                <Ionicons name="create-outline" size={22} color="#0f3e17" />
              </View>
            </Pressable>
          )}
        />

        <Pressable
          style={({ pressed }) => [styles.agregarBoton, pressed && estilos.buttonPressed]}
          onPress={abrirNueva}
          accessibilityRole="button"
          accessibilityLabel="Agregar una sede"
        >
          <View style={styles.agregarFila}>
            <Ionicons name="add-circle-outline" size={20} color="#fffefc" />
            <Text style={estilos.buttonTextPrimary}>Agregar sede</Text>
          </View>
        </Pressable>
      </View>

      <Modal
        visible={modalAbierto}
        transparent
        animationType="fade"
        onRequestClose={cerrarEdicion}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={cerrarEdicion}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
          {modalAbierto ? (
            <View style={estilos.modalCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={cerrarEdicion}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>

              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={estilos.modalTitle}>
                  {sedeEnEdicion === null ? 'Agregar sede' : `Editar sede`}
                </Text>

                <Text style={estilos.formLabel}>Nombre</Text>
                <TextInput
                  style={estilos.formInput}
                  placeholder="Ej. Palermo"
                  placeholderTextColor="#7a8378"
                  value={nombre}
                  onChangeText={setNombre}
                  autoCapitalize="words"
                  returnKeyType="next"
                />

                <Text style={estilos.formLabel}>Dirección</Text>
                <TextInput
                  style={estilos.formInput}
                  placeholder="Ej. Av. Corrientes 5000"
                  placeholderTextColor="#7a8378"
                  value={direccion}
                  onChangeText={setDireccion}
                  returnKeyType="next"
                />

                <Text style={estilos.formLabel}>Días de atención</Text>
                <View style={styles.diasFila}>
                  {DIAS.map((dia) => {
                    const elegido = dias.includes(dia.clave);
                    return (
                      <Pressable
                        key={dia.clave}
                        style={({ pressed }) => [
                          styles.diaChip,
                          elegido && styles.diaChipElegido,
                          pressed && estilos.buttonPressed,
                        ]}
                        onPress={() => alternarDia(dia.clave)}
                        accessibilityRole="checkbox"
                        accessibilityLabel={dia.largo}
                        accessibilityState={{ checked: elegido }}
                      >
                        <Text style={[styles.diaTexto, elegido && styles.diaTextoElegido]}>
                          {dia.corto}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={estilos.formLabel}>Horario de atención</Text>
                <View style={styles.horariosInputs}>
                  <View style={styles.horarioCampo}>
                    <Text style={styles.horarioSubtitulo}>Abre</Text>
                    <TextInput
                      style={estilos.formInput}
                      placeholder="09:00"
                      placeholderTextColor="#7a8378"
                      value={horaDesde}
                      onChangeText={setHoraDesde}
                      keyboardType="number-pad"
                      maxLength={5}
                      returnKeyType="next"
                    />
                  </View>
                  <View style={styles.horarioCampo}>
                    <Text style={styles.horarioSubtitulo}>Cierra</Text>
                    <TextInput
                      style={estilos.formInput}
                      placeholder="18:00"
                      placeholderTextColor="#7a8378"
                      value={horaHasta}
                      onChangeText={setHoraHasta}
                      keyboardType="number-pad"
                      maxLength={5}
                      returnKeyType="done"
                      onSubmitEditing={guardar}
                    />
                  </View>
                </View>

                {error ? (
                  <Text style={styles.createError} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}
              </ScrollView>

              <View style={estilos.modalActions}>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonPrimary, styles.guardarBoton]}
                  onPress={() => void guardar()}
                  disabled={guardando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>Guardar</Text>
                </Pressable>
              </View>

              {sedeEnEdicion === null ? null : (
                <Pressable
                  style={({ pressed }) => [styles.eliminar, pressed && estilos.buttonPressed]}
                  onPress={() => setSedeAEliminar(sedeEnEdicion)}
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar la sede ${sedeEnEdicion.nombre}`}
                >
                  <Text style={styles.eliminarTexto}>Eliminar sede</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={sedeAEliminar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSedeAEliminar(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setSedeAEliminar(null)}
            accessibilityRole="button"
            accessibilityLabel="Cancelar eliminación"
          />
          {sedeAEliminar ? (
            <View style={estilos.modalCard}>
              <Text style={estilos.modalTitle}>¿Eliminar sede?</Text>
              <Text style={estilos.modalText}>
                ¿Estás seguro de que quieres eliminar la sede {sedeAEliminar.nombre}? No se puede eliminar si tiene turnos asociados.
              </Text>
              <View style={[estilos.modalActions, styles.accionesCentradas]}>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonNeutral]}
                  onPress={() => setSedeAEliminar(null)}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  style={[estilos.modalButton, styles.deleteButton]}
                  onPress={() => void confirmarEliminacion()}
                  disabled={guardando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                    Sí, eliminar
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <AvisoExito
        visible={sedeGuardada !== null}
        titulo={sedeGuardada?.editando ? '¡Sede actualizada!' : '¡Sede agregada!'}
        subtitulo={
          sedeGuardada !== null
            ? `${sedeGuardada.nombre} quedó ${sedeGuardada.editando ? 'actualizada' : 'guardada'} correctamente.`
            : undefined
        }
        etiquetaBoton="Cerrar el aviso de sede guardada"
        onCerrar={() => setSedeGuardada(null)}
      />

      <AvisoExito
        visible={sedeEliminada !== null}
        titulo="¡Sede eliminada!"
        subtitulo={
          sedeEliminada !== null ? `${sedeEliminada} se eliminó correctamente.` : undefined
        }
        etiquetaBoton="Cerrar el aviso de sede eliminada"
        onCerrar={() => setSedeEliminada(null)}
      />

      <AvisoExito
        visible={errorEliminar !== ''}
        variante="error"
        titulo="No se pudo eliminar la sede"
        subtitulo={errorEliminar}
        etiquetaBoton="Cerrar el aviso de error"
        onCerrar={() => setErrorEliminar('')}
      />
    </AppDrawer>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: '#fffefc',
  },
  sedeFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sedeIcono: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#cfe7d3',
  },
  sedeTexto: {
    flex: 1,
  },
  horarioFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  horarioTexto: {
    color: '#6b7d6d',
    fontSize: 13,
  },
  agregarFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  agregarBoton: {
    marginHorizontal: 15,
    marginVertical: 12,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#0f3e17',
  },
  guardarBoton: {
    flex: 1,
  },
  diasFila: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  diaChip: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  diaChipElegido: {
    borderColor: '#0f3e17',
    backgroundColor: '#e8f3e4',
  },
  diaTexto: {
    color: '#1e3326',
    fontSize: 15,
    fontWeight: '500',
  },
  diaTextoElegido: {
    color: '#0f3e17',
    fontWeight: 'bold',
  },
  horariosInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  horarioCampo: {
    flex: 1,
  },
  horarioSubtitulo: {
    color: '#69746a',
    fontSize: 12,
    marginBottom: 4,
  },
  createError: {
    color: '#a32828',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
  },
  eliminar: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: '#d3a179',
    borderRadius: 12,
    backgroundColor: '#f7ede6',
  },
  eliminarTexto: {
    color: '#8a5324',
    fontSize: 15,
    fontWeight: '600',
  },
  // La confirmacion es una decision, no una accion de formulario: los
  // botones van al centro de la ventana, parejos y con el mismo peso a los lados.
  accionesCentradas: { justifyContent: 'center' as const },
  deleteButton: {
    backgroundColor: '#a32d2d',
  },
});