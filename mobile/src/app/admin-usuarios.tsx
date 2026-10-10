import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import { obtenerUsuarioActual } from '@/lib/session';

type UsuarioAdministrado = {
  id: number;
  nombre: string;
  email: string;
  role: string;
};

type FiltroRol = 'todos' | 'veterinarios' | 'usuarios';

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

function esUsuarioAdministrado(value: unknown): value is UsuarioAdministrado {
  if (typeof value !== 'object' || value === null) return false;
  const usuario = value as Record<string, unknown>;
  return (
    typeof usuario.id === 'number' &&
    typeof usuario.nombre === 'string' &&
    typeof usuario.email === 'string' &&
    typeof usuario.role === 'string'
  );
}

export default function AdminUsuariosScreen() {
  const [usuarios, setUsuarios] = useState<UsuarioAdministrado[]>([]);
  const [usuarioAEliminar, setUsuarioAEliminar] = useState<UsuarioAdministrado | null>(null);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [veterinarioCreado, setVeterinarioCreado] = useState<UsuarioAdministrado | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [emailNuevo, setEmailNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');
  const [miId, setMiId] = useState<number | null>(null);
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState<FiltroRol>('todos');

  const cargarUsuarios = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const sesion = await obtenerUsuarioActual();
      if (!sesion?.esAdmin) {
        router.replace('/app');
        return;
      }
      setMiId(sesion.id);
      setToken(sesion.accessToken);
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${sesion.accessToken}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar los usuarios.');
        setUsuarios([]);
        return;
      }
      if (!Array.isArray(result)) {
        setError('La API devolvió una lista de usuarios inválida.');
        setUsuarios([]);
        return;
      }
      setUsuarios(result);
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setUsuarios([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarUsuarios();
    }, [cargarUsuarios])
  );

  const confirmarEliminacion = async () => {
    if (!usuarioAEliminar || eliminando) return;
    setEliminando(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${usuarioAEliminar.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        const result: unknown = await response.json();
        Alert.alert('No se pudo eliminar', mensajeApi(result) ?? 'Inténtalo nuevamente.');
        return;
      }
      setUsuarios((actuales) => actuales.filter((item) => item.id !== usuarioAEliminar.id));
      setUsuarioAEliminar(null);
    } catch (requestError) {
      Alert.alert('No se pudo eliminar', apiUnreachableMessage(requestError));
    } finally {
      setEliminando(false);
    }
  };

  const cerrarCrear = () => {
    if (creando) return;
    setMostrarCrear(false);
    setErrorCrear('');
  };

  const crearVeterinario = async () => {
    if (creando) return;
    if (
      !nombreNuevo.trim() ||
      !emailNuevo.trim() ||
      !telefonoNuevo.trim()
    ) {
      setErrorCrear('Completa todos los campos para continuar.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(emailNuevo.trim())) {
      setErrorCrear('Revisa el formato del correo electrónico.');
      return;
    }
    setCreando(true);
    setErrorCrear('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre: nombreNuevo.trim(),
          email: emailNuevo.trim(),
          telefono: telefonoNuevo.trim(),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setErrorCrear(mensajeApi(result) ?? 'No se pudo crear el veterinario.');
        return;
      }
      if (!esUsuarioAdministrado(result) || result.role !== 'ADMIN') {
        throw new Error('La API devolvió datos de veterinario inválidos.');
      }

      setUsuarios((actuales) => [...actuales, result]);
      setNombreNuevo('');
      setEmailNuevo('');
      setTelefonoNuevo('');
      setMostrarCrear(false);
      setVeterinarioCreado(result);
    } catch (requestError) {
      setErrorCrear(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : requestError instanceof Error
            ? requestError.message
            : apiUnreachableMessage(requestError)
      );
    } finally {
      setCreando(false);
    }
  };

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const coincideRol =
      filtroRol === 'todos' ||
      (filtroRol === 'veterinarios' && usuario.role === 'ADMIN') ||
      (filtroRol === 'usuarios' && usuario.role !== 'ADMIN');
    const consulta = busqueda.trim().toLocaleLowerCase();
    const coincideBusqueda =
      !consulta ||
      usuario.nombre.toLocaleLowerCase().includes(consulta) ||
      usuario.email.toLocaleLowerCase().includes(consulta);
    return coincideRol && coincideBusqueda;
  });

  const filtros: { id: FiltroRol; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'veterinarios', label: 'Veterinarios' },
    { id: 'usuarios', label: 'Usuarios' },
  ];

  return (
    <AppDrawer title="Administrar usuarios">
      <View style={estilos.screenWithFooter}>
        <FlatList
          style={estilos.container}
          data={usuariosFiltrados}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={estilos.listPadding}
          ListHeaderComponent={
            <View>
              <Pressable
                style={StyleSheet.flatten([estilos.addTurnButton, styles.addUserButton])}
                onPress={() => {
                  setErrorCrear('');
                  setMostrarCrear(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Crear veterinario"
              >
                <Ionicons name="person-add-outline" size={21} color="#fffefc" />
                <Text style={estilos.buttonTextPrimary}>Crear veterinario</Text>
              </Pressable>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={20} color="#53665a" />
                <TextInput
                  style={styles.searchInput}
                  value={busqueda}
                  onChangeText={setBusqueda}
                  placeholder="Buscar por nombre o correo"
                  placeholderTextColor="#718076"
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Buscar usuarios por nombre o correo"
                  returnKeyType="search"
                />
                {busqueda.length > 0 ? (
                  <Pressable
                    onPress={() => setBusqueda('')}
                    accessibilityRole="button"
                    accessibilityLabel="Borrar búsqueda"
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={20} color="#53665a" />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.filterRow} accessibilityRole="tablist">
                {filtros.map((filtro) => {
                  const seleccionado = filtroRol === filtro.id;
                  return (
                    <Pressable
                      key={filtro.id}
                      style={[styles.filterTab, seleccionado && styles.filterTabSelected]}
                      onPress={() => setFiltroRol(filtro.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: seleccionado }}
                    >
                      <Text
                        style={[
                          styles.filterTabText,
                          seleccionado && styles.filterTabTextSelected,
                        ]}
                      >
                        {filtro.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ paddingVertical: 18 }}>
              {cargando ? (
                <ActivityIndicator color="#0f3e17" />
              ) : (
                <Text style={estilos.cardSubtitle}>
                  {error ||
                    (usuarios.length === 0
                      ? 'No hay usuarios registrados.'
                      : 'No se encontraron usuarios con esos criterios.')}
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={estilos.cardVertical}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.cardTitle}>{item.nombre}</Text>
                  <Text style={estilos.cardSubtitle}>{item.email}</Text>
                  <Text style={estilos.cardSubtitle}>
                    {item.role === 'ADMIN' ? 'Veterinario' : 'Usuario normal'}
                    {item.id === miId ? ' · Tú' : ''}
                  </Text>
                </View>
                {item.id !== miId ? (
                  <Pressable
                    onPress={() => setUsuarioAEliminar(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar a ${item.nombre}`}
                    style={{ padding: 10 }}
                  >
                    <Ionicons name="trash-outline" size={22} color="#a32d2d" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        />
      </View>

      <Modal
        visible={mostrarCrear}
        transparent
        animationType="fade"
        onRequestClose={cerrarCrear}
        statusBarTranslucent
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={cerrarCrear}
            disabled={creando}
            accessibilityRole="button"
            accessibilityLabel="Cerrar creación de veterinario"
          />
          <View style={styles.createModalCard}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={estilos.modalTitle}>Crear veterinario</Text>
              <Text style={[estilos.modalText, { marginBottom: 16 }]}>
                Completa los datos de la cuenta. La contraseña inicial será su nombre completo y
                podrá cambiarla desde su perfil.
              </Text>
              <TextInput
                style={styles.createInput}
                placeholder="Nombre completo"
                value={nombreNuevo}
                onChangeText={setNombreNuevo}
                autoCapitalize="words"
                autoComplete="name"
                editable={!creando}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Correo electrónico"
                value={emailNuevo}
                onChangeText={setEmailNuevo}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!creando}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Teléfono"
                value={telefonoNuevo}
                onChangeText={setTelefonoNuevo}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!creando}
              />
              {errorCrear ? (
                <Text style={styles.createError} accessibilityRole="alert">
                  {errorCrear}
                </Text>
              ) : null}
              <View style={estilos.modalActions}>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonNeutral]}
                  onPress={cerrarCrear}
                  disabled={creando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonPrimary]}
                  onPress={() => void crearVeterinario()}
                  disabled={creando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                    {creando ? 'Creando...' : 'Crear'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={veterinarioCreado !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setVeterinarioCreado(null)}
        statusBarTranslucent
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setVeterinarioCreado(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar confirmación"
          />
          <View style={estilos.modalCard} accessibilityRole="alert">
            <Ionicons
              name="checkmark-circle"
              size={44}
              color="#0f3e17"
              style={{ alignSelf: 'center', marginBottom: 10 }}
            />
            <Text style={[estilos.modalTitle, { textAlign: 'center' }]}>
              Veterinario creado con éxito
            </Text>
            {veterinarioCreado ? (
              <Text style={[estilos.modalText, { marginTop: 8 }]}>
                Puede iniciar sesión con:
                {'\n'}Correo: {veterinarioCreado.email}
                {'\n'}Contraseña inicial: {veterinarioCreado.nombre}
              </Text>
            ) : null}
            <View style={estilos.modalActions}>
              <Pressable
                style={[estilos.modalButton, estilos.modalButtonPrimary]}
                onPress={() => setVeterinarioCreado(null)}
                accessibilityRole="button"
                accessibilityLabel="Aceptar"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  Aceptar
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={usuarioAEliminar !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!eliminando) setUsuarioAEliminar(null);
        }}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => {
              if (!eliminando) setUsuarioAEliminar(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancelar eliminación"
          />
          {usuarioAEliminar ? (
            <View style={estilos.modalCard}>
              <Text style={estilos.modalTitle}>¿Eliminar usuario?</Text>
              <Text style={estilos.modalText}>
                ¿Estás seguro de que quieres eliminar la cuenta de {usuarioAEliminar.nombre}?
                También se eliminarán sus mascotas y turnos.
              </Text>
              <View style={estilos.modalActions}>
                <Pressable
                  style={[estilos.modalButton, estilos.modalButtonNeutral]}
                  onPress={() => setUsuarioAEliminar(null)}
                  disabled={eliminando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  style={[estilos.modalButton, styles.deleteButton]}
                  onPress={() => void confirmarEliminacion()}
                  disabled={eliminando}
                  accessibilityRole="button"
                >
                  <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                    {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
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

const styles = {
  addUserButton: {
    gap: 24,
    marginBottom: 16,
  },
  searchBox: {
    minHeight: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    borderRadius: 10,
    backgroundColor: '#fffefc',
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 8,
    color: '#222222',
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#d8e3d5',
    borderRadius: 10,
    backgroundColor: '#fffefc',
  },
  filterTabSelected: {
    borderColor: '#0f3e17',
    backgroundColor: '#e1f4df',
  },
  filterTabText: {
    color: '#365247',
    fontSize: 14,
    fontWeight: '500' as const,
  },
  filterTabTextSelected: {
    color: '#0f3e17',
    fontWeight: 'bold' as const,
  },
  deleteButton: {
    backgroundColor: '#a32d2d',
  },
  createModalCard: {
    width: '92%' as const,
    maxWidth: 520,
    maxHeight: '88%' as const,
    backgroundColor: '#fffefc',
    borderRadius: 12,
    padding: 20,
  },
  createInput: {
    width: '100%' as const,
    minHeight: 48,
    backgroundColor: '#f3f7f1',
    borderColor: '#d8e3d5',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  createError: {
    color: '#a32828',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
};
