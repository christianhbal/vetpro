import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { estilos } from '@/lib/estilos';

type Sede = {
  id: number;
  nombre: string;
  direccion: string;
};

const sedes: Sede[] = [
  { id: 1, nombre: 'Recoleta', direccion: 'Av. Recoleta 1234' },
  { id: 2, nombre: 'San Isidro', direccion: 'Av. Centenario 2450' },
  { id: 3, nombre: 'Vicente López', direccion: 'Av. del Libertador 1580' },
];

export default function AdminSedesScreen() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sedeEnEdicion, setSedeEnEdicion] = useState<Sede | null>(null);
  const [sedeAEliminar, setSedeAEliminar] = useState<Sede | null>(null);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [error, setError] = useState('');

  const abrirNueva = () => {
    setSedeEnEdicion(null);
    setNombre('');
    setDireccion('');
    setError('');
    setModalAbierto(true);
  };

  const abrirEdicion = (sede: Sede) => {
    setSedeEnEdicion(sede);
    setNombre(sede.nombre);
    setDireccion(sede.direccion);
    setError('');
    setModalAbierto(true);
  };

  const cerrarEdicion = () => setModalAbierto(false);

  const guardar = () => {
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

    cerrarEdicion();
  };

  const confirmarEliminacion = () => {
    setSedeAEliminar(null);
    cerrarEdicion();
  };

  return (
    <AppDrawer title="Sedes">
      <View style={styles.pantalla}>
        <FlatList
          data={sedes}
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

              <Text style={estilos.modalTitle}>
                {sedeEnEdicion === null ? 'Agregar sede' : `Editar ${sedeEnEdicion.nombre}`}
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
                returnKeyType="done"
                onSubmitEditing={guardar}
              />

              {error ? (
                <Text style={styles.createError} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}

              <View style={estilos.modalActions}>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonPrimary, styles.guardarBoton]}
                  onPress={guardar}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>Guardar cambios</Text>
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
                ¿Estás seguro de que quieres eliminar la sede {sedeAEliminar.nombre}? Los turnos
                agendados en esa sede también quedan sin sede asignada.
              </Text>
              <View style={estilos.modalActions}>
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
                  onPress={confirmarEliminacion}
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
  createError: {
    color: '#a32828',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
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
  deleteButton: {
    backgroundColor: '#a32d2d',
  },
});