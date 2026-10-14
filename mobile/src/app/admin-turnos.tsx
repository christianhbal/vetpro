import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppDrawer } from '@/components/app-drawer';
import { AvisoExito } from '@/components/aviso-exito';
import { CalendarioTurnos } from '@/components/calendario-turnos';
import TurnoDateTimeField from '@/components/turno-date-time-field';
import { API_BASE_URL, apiUnreachableMessage } from '@/lib/api';
import { estilos } from '@/lib/estilos';
import {
  descripcionEspecieMascota,
  esSedeVeterinaria,
  sedesVeterinaria,
  turnoSiguePendiente,
  type SedeVeterinaria,
} from '@/lib/datos';
import { obtenerUsuarioActual } from '@/lib/session';
import { useSedeSeleccionada } from '@/lib/sede';

type TurnoAdministrado = {
  id: number;
  tipo: string;
  sede: SedeVeterinaria;
  fecha: string;
  hora: string;
  llegadaEn: string | null;
  atendidoEn: string | null;
  descripcion?: string | null;
  esDemo?: boolean;
  /** Ocupa la agenda pero no se lista: dias completos y turnos de historia. */
  ocultoEnAgenda?: boolean;
  user: { nombre: string; email: string };
  mascota: {
    id: number;
    nombre: string;
    especie: string;
    raza: string | null;
    foto?: string | null;
  };
};

type HorarioOcupado = { fecha: string; hora: string };

const tiposTurno = ['Control', 'Vacunas', 'Estética'] as const;

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia}/${mes}`;
}

function esHorarioOcupado(value: unknown): value is HorarioOcupado {
  if (typeof value !== 'object' || value === null) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.fecha === 'string' && typeof slot.hora === 'string';
}

function mensajeApi(resultado: unknown): string | null {
  if (typeof resultado !== 'object' || resultado === null || !('message' in resultado)) {
    return null;
  }
  return typeof resultado.message === 'string' ? resultado.message : null;
}

function esTurnoAdministrado(value: unknown): value is TurnoAdministrado {
  if (typeof value !== 'object' || value === null) return false;
  const turno = value as Record<string, unknown>;
  const mascota = turno.mascota;
  if (typeof mascota !== 'object' || mascota === null) return false;
  const datosMascota = mascota as Record<string, unknown>;
  return (
    typeof turno.id === 'number' &&
    typeof turno.tipo === 'string' &&
    esSedeVeterinaria(turno.sede) &&
    typeof turno.fecha === 'string' &&
    typeof turno.hora === 'string' &&
    (typeof turno.llegadaEn === 'string' || turno.llegadaEn === null) &&
    (typeof turno.atendidoEn === 'string' || turno.atendidoEn === null) &&
    typeof turno.user === 'object' &&
    turno.user !== null &&
    typeof datosMascota.nombre === 'string' &&
    typeof datosMascota.especie === 'string' &&
    (typeof datosMascota.raza === 'string' || datosMascota.raza === null)
  );
}

export default function AdminTurnosScreen() {
  const router = useRouter();
  const [turnos, setTurnos] = useState<TurnoAdministrado[]>([]);
  const [ahora, setAhora] = useState(() => new Date());
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<TurnoAdministrado | null>(null);
  const [turnoGuardado, setTurnoGuardado] = useState<{ mascota: string; texto: string } | null>(
    null
  );
  const [turnoCancelado, setTurnoCancelado] = useState<{ mascota: string; texto: string } | null>(
    null
  );
  const [tipo, setTipo] = useState('Control');
  const [sede, setSede] = useState<SedeVeterinaria>('Recoleta');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [token, setToken] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorGuardado, setErrorGuardado] = useState('');
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState('');
  /**
   * Por que se cancela, escrito por la veterinaria.
   *
   * Via en el cuerpo del DELETE y el backend lo copia al aviso del cliente: es
   * lo unico que va a leer el dueño para entender que paso, asi que va
   * obligatorio y no un detalle.
   */
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [horariosOcupados, setHorariosOcupados] = useState<HorarioOcupado[]>([]);
  const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);
  const [errorDisponibilidad, setErrorDisponibilidad] = useState('');

  // La sede arranca en la que se esta mirando en la portada y en Turnos, y si se
  // elige una aca queda elegida en las tres pantallas.
  const [sedeFiltro, setSedeFiltro] = useSedeSeleccionada();
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const filtroSede: 'Todas' | SedeVeterinaria = mostrarTodas ? 'Todas' : sedeFiltro;
  const setFiltroSede = (valor: 'Todas' | SedeVeterinaria) => {
    if (valor === 'Todas') {
      setMostrarTodas(true);
      return;
    }
    setMostrarTodas(false);
    setSedeFiltro(valor);
  };

  const cargarTurnos = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const sesion = await obtenerUsuarioActual();
      if (!sesion?.esAdmin) {
        router.replace('/app');
        return;
      }
      setToken(sesion.accessToken);
      const response = await fetch(`${API_BASE_URL}/api/admin/turnos`, {
        headers: { Authorization: `Bearer ${sesion.accessToken}` },
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setError(mensajeApi(result) ?? 'No se pudieron cargar los turnos.');
        setTurnos([]);
        return;
      }
      if (!Array.isArray(result)) {
        setError('La API devolvió una lista de turnos inválida.');
        setTurnos([]);
        return;
      }
      setTurnos(result);
      setAhora(new Date());
    } catch (fetchError) {
      setError(apiUnreachableMessage(fetchError));
      setTurnos([]);
    } finally {
      setCargando(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void cargarTurnos();
    }, [cargarTurnos])
  );

  const cargarDisponibilidad = useCallback(
    async (year: number, month: number, sedeConsultada: SedeVeterinaria) => {
      const mes = `${year}-${String(month).padStart(2, '0')}`;
      setCargandoDisponibilidad(true);
      setErrorDisponibilidad('');
      setHorariosOcupados([]);
      try {
        const sesion = await obtenerUsuarioActual();
        if (!sesion) {
          throw new Error('Inicia sesión para consultar la disponibilidad.');
        }
        const response = await fetch(
          `${API_BASE_URL}/api/turnos/disponibilidad?mes=${encodeURIComponent(mes)}&sede=${encodeURIComponent(sedeConsultada)}`,
          { headers: { Authorization: `Bearer ${sesion.accessToken}` } }
        );
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error(mensajeApi(result) ?? 'No se pudo cargar la disponibilidad.');
        }
        if (!Array.isArray(result) || !result.every(esHorarioOcupado)) {
          throw new Error('La API devolvió horarios ocupados inválidos.');
        }
        setHorariosOcupados(result);
      } catch (requestError) {
        setErrorDisponibilidad(
          requestError instanceof TypeError
            ? apiUnreachableMessage(requestError)
            : requestError instanceof Error
              ? requestError.message
              : apiUnreachableMessage(requestError)
        );
      } finally {
        setCargandoDisponibilidad(false);
      }
    },
    []
  );

  const abrirEdicion = (turno: TurnoAdministrado) => {
    setSeleccionado(turno);
    setErrorGuardado('');
    setTipo(turno.tipo);
    setSede(turno.sede);
    setFecha(turno.fecha);
    setHora(turno.hora);
    const [year, month] = turno.fecha.split('-').map(Number);
    if (year && month) void cargarDisponibilidad(year, month, turno.sede);
  };

  const valorHoy = fechaComoValor(ahora);

  // Aca se modifican los turnos que todavia novene: los que ya pasaron la hora o
  // ya fueron atendidos no se tocan, y los que solo ocupan la agenda (dias
  // completos) tampoco. Los de ejemplo flotan y se ven siempre.
  const aModificar = useMemo(
    () =>
      turnos.filter(
        (turno) =>
          !turno.ocultoEnAgenda &&
          turno.atendidoEn === null &&
          (turno.esDemo === true || turnoSiguePendiente(turno, ahora))
      ),
    [turnos, ahora]
  );

  const turnosDelDia = useMemo(() => {
    return aModificar
      .filter((turno) => filtroSede === 'Todas' || turno.sede === filtroSede)
      .filter((turno) => (fechaSeleccionada === null ? true : turno.fecha === fechaSeleccionada))
      .sort((a, b) =>
        a.fecha === b.fecha ? a.hora.localeCompare(b.hora) : a.fecha.localeCompare(b.fecha)
      );
  }, [aModificar, fechaSeleccionada, filtroSede]);

  const cancelarTurno = async () => {
    if (!seleccionado || cancelando) return;
    setErrorCancelar('');

    // El motivo es lo que va a entender el dueño, asi que no se cancela sin el.
    const motivo = motivoCancelacion.trim();
    if (motivo.length < 4) {
      setErrorCancelar('Contá por qué se cancela: es lo que va a leer el dueño.');
      return;
    }

    setCancelando(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/turnos/${seleccionado.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setErrorCancelar(mensajeApi(result) ?? 'No se pudo cancelar el turno.');
        setConfirmarCancelacion(false);
        return;
      }
      if (
        typeof result !== 'object' ||
        result === null ||
        !('cancelado' in result) ||
        result.cancelado !== true
      ) {
        setErrorCancelar('La API no confirmó la cancelación del turno.');
        return;
      }

      setConfirmarCancelacion(false);
      setMotivoCancelacion('');
      setSeleccionado(null);
      await cargarTurnos();
      // El aviso se arma despues de recargar: si la lista falla, el admin ve el
      // error de la pantalla y no un "listo" que lo invite a tocar un turno ya
      // borrado.
      setTurnoCancelado({
        mascota: seleccionado.mascota.nombre,
        texto: `${fechaCorta(seleccionado.fecha)} a las ${seleccionado.hora} hs`,
      });
    } catch (requestError) {
      setErrorCancelar(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : 'No se pudo cancelar el turno.'
      );
      setConfirmarCancelacion(false);
    } finally {
      setCancelando(false);
    }
  };

  const guardarCambios = async () => {
    if (!seleccionado || guardando) return;
    setErrorGuardado('');

    // El backend tambien lo rechaza, pero avisar aca evita el viaje y deja el
    // error al lado del campo. El texto va al dueño: "hora: 19:00 -> 18:00"
    // sobre un turno que ya estaba despues no se puede atender.
    if (seleccionado && `${fecha.trim()}T${hora.trim()}` < `${seleccionado.fecha}T${seleccionado.hora}`) {
      setErrorGuardado(
        'No se puede mover un turno a un horario anterior. Solo se puede estirar o pizarlo para otro día.'
      );
      return;
    }

    setGuardando(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/turnos/${seleccionado.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tipo, sede, fecha: fecha.trim(), hora: hora.trim() }),
        }
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        setErrorGuardado(mensajeApi(result) ?? 'No se pudo modificar el turno.');
        return;
      }
      if (!esTurnoAdministrado(result) || result.id !== seleccionado.id) {
        throw new Error('La API no confirmó los cambios del turno.');
      }
      if (result.sede !== sede || result.fecha !== fecha.trim() || result.hora !== hora.trim()) {
        throw new Error('La API no guardó la sede, fecha y hora solicitadas.');
      }

      const listaResponse = await fetch(`${API_BASE_URL}/api/admin/turnos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listaActualizada: unknown = await listaResponse.json();
      if (
        !listaResponse.ok ||
        !Array.isArray(listaActualizada) ||
        !listaActualizada.every(esTurnoAdministrado)
      ) {
        throw new Error(mensajeApi(listaActualizada) ?? 'No se pudo confirmar el turno actualizado.');
      }
      const turnoActualizado = listaActualizada.find((turno) => turno.id === seleccionado.id);
      if (
        !turnoActualizado ||
        turnoActualizado.sede !== sede ||
        turnoActualizado.fecha !== fecha.trim() ||
        turnoActualizado.hora !== hora.trim()
      ) {
        throw new Error('El turno no aparece actualizado al volver a consultar la lista.');
      }

      setTurnos(listaActualizada);
      setAhora(new Date());
      setTurnoGuardado({
        mascota: seleccionado.mascota.nombre,
        texto: `${tipo} · ${sede} · ${fechaCorta(fecha.trim())} a las ${hora.trim()} hs`,
      });
      setSeleccionado(null);
    } catch (requestError) {
      setErrorGuardado(
        requestError instanceof TypeError
          ? apiUnreachableMessage(requestError)
          : requestError instanceof Error
            ? requestError.message
            : apiUnreachableMessage(requestError)
      );
    } finally {
      setGuardando(false);
    }
  };

  const renderTurno = (turno: TurnoAdministrado) => (
    <Pressable
      key={String(turno.id)}
      style={({ pressed }) => [estilos.cardTurno, pressed && estilos.buttonPressed]}
      onPress={() => abrirEdicion(turno)}
      accessibilityRole="button"
      accessibilityLabel={`Modificar turno de ${turno.mascota.nombre}`}
    >
      <View style={styles.turnoFila}>
        {turno.mascota.foto ? (
          <Image
            source={{ uri: turno.mascota.foto }}
            style={styles.turnoFoto}
            resizeMode="contain"
            accessibilityLabel={`Foto de ${turno.mascota.nombre}`}
          />
        ) : (
          <View style={styles.turnPhotoPlaceholder}>
            <Ionicons name="paw-outline" size={26} color="#0f3e17" />
          </View>
        )}
        <View style={styles.turnoTexto}>
          <Text
            style={[estilos.cardTituloTurno, styles.turnoTitulo]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {turno.mascota.nombre} - {turno.tipo}
          </Text>
          <Text style={styles.dueno} numberOfLines={1} ellipsizeMode="tail">
            {turno.user.nombre}
          </Text>
          <Text style={estilos.cardSubtituloTurno} numberOfLines={1} ellipsizeMode="tail">
            {fechaCorta(turno.fecha)} - {turno.hora} hs
            {/* La sede se repite en cada tarjeta y ya se sabe por el filtro de
                arriba. Solo se muestra cuando la vista es "Todas", que es el
                único caso en que aporta algo. */}
            {filtroSede === 'Todas' ? ` - ${turno.sede}` : ''}
          </Text>
        </View>

        <Ionicons name="create-outline" size={20} color="#8aa38c" />
      </View>
    </Pressable>
  );

  const cuerpoLista = () => {
    if (cargando) {
      return <ActivityIndicator color="#2f7a3f" style={styles.cargandoLista} />;
    }
    if (error) {
      return <Text style={[estilos.cardSubtituloTurno, styles.notaVacia]}>{error}</Text>;
    }
    if (turnosDelDia.length === 0) {
      return (
        <Text style={[estilos.cardSubtituloTurno, styles.notaVacia]}>
          {fechaSeleccionada
            ? 'Ese día no tiene turnos para modificar.'
            : 'No hay turnos próximos para modificar.'}
        </Text>
      );
    }
    return <>{turnosDelDia.map(renderTurno)}</>;
  };

  const tituloLista = fechaSeleccionada
    ? `Turnos del ${new Date(`${fechaSeleccionada}T12:00:00`).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}`
    : 'Turnos a modificar';

  return (
    <AppDrawer title="Administrar turnos">
      <View style={styles.pantalla}>
        <View style={styles.cabecera}>
          <View style={styles.bloqueSede}>
            <Text style={styles.labelSede}>Sede</Text>
            <View style={styles.filaSedes}>
              {['Todas', ...sedesVeterinaria].map((opcion) => {
                const seleccionada = filtroSede === opcion;
                return (
                  <Pressable
                    key={opcion}
                    onPress={() => {
                      setFiltroSede(opcion as 'Todas' | SedeVeterinaria);
                      setSeleccionado(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityLabel={opcion}
                    accessibilityState={{ selected: seleccionada }}
                    style={({ pressed }) => [
                      styles.sedeChip,
                      seleccionada && styles.sedeChipActivo,
                      pressed && estilos.buttonPressed,
                    ]}
                  >
                    <Text style={[styles.sedeTexto, seleccionada && styles.sedeTextoActivo]}>
                      {opcion}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <CalendarioTurnos
            turnos={aModificar.filter(
              (turno) => filtroSede === 'Todas' || turno.sede === filtroSede
            )}
            valorHoy={valorHoy}
            fechaSeleccionada={fechaSeleccionada}
            onSelectFecha={(valor) => {
              setFechaSeleccionada(valor === '' ? null : valor);
              setSeleccionado(null);
            }}
          />
        </View>

        <View style={styles.listas}>
          <View style={styles.lista}>
            <View style={styles.listaEncabezado}>
              <View style={styles.listaFila}>
                <Text style={[estilos.sectionTitleTurno, styles.tituloSeccion]}>{tituloLista}</Text>
                {fechaSeleccionada ? (
                  <Pressable
                    style={({ pressed }) => [estilos.cerrarCirculo, pressed && estilos.buttonPressed]}
                    onPress={() => setFechaSeleccionada(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Volver a todos los turnos a modificar"
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={24} color="#263b32" />
                  </Pressable>
                ) : null}
              </View>
              <Text style={[estilos.sectionSubtitleTurno, styles.subtituloSeccion]}>
                {turnosDelDia.length === 1 ? '1 turno' : `${turnosDelDia.length} turnos`}
              </Text>
            </View>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              contentContainerStyle={styles.listaContenido}
            >
              {cuerpoLista()}
            </ScrollView>
          </View>
        </View>
      </View>

      <Modal
        visible={seleccionado !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSeleccionado(null)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setSeleccionado(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar edición de turno"
          />
          {seleccionado ? (
            <View style={estilos.modalCard}>
              <Pressable
                style={({ pressed }) => [estilos.petPhotoClose, pressed && estilos.buttonPressed]}
                onPress={() => setSeleccionado(null)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar edición de turno"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={estilos.modalTitle}>Modificar turno</Text>
                <Text style={styles.modalNombreMascota}>{seleccionado.mascota.nombre}</Text>
                <Text style={estilos.modalText}>
                  Tipo de mascota:{' '}
                  {descripcionEspecieMascota(
                    seleccionado.mascota.especie,
                    seleccionado.mascota.raza
                  )}
                </Text>
                <Text style={estilos.modalText}>Dueño: {seleccionado.user.nombre}</Text>
                <Text style={styles.label}>Tipo de turno</Text>
                <View style={styles.filaOpciones}>
                  {tiposTurno.map((opcion) => {
                    const elegida = tipo === opcion;
                    return (
                      <Pressable
                        key={opcion}
                        onPress={() => setTipo(opcion)}
                        accessibilityRole="radio"
                        accessibilityLabel={opcion}
                        accessibilityState={{ selected: elegida }}
                        style={({ pressed }) => [
                          styles.opcion,
                          elegida && styles.opcionSeleccionada,
                          pressed && estilos.buttonPressed,
                        ]}
                      >
                        <Text
                          style={[styles.opcionTexto, elegida && styles.opcionTextoSeleccionado]}
                        >
                          {opcion}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Sede</Text>
                <View style={styles.filaOpciones}>
                  {sedesVeterinaria.map((opcion) => {
                    const elegida = sede === opcion;
                    return (
                      <Pressable
                        key={opcion}
                        onPress={() => {
                          if (opcion === sede) return;
                          setSede(opcion);
                          const [year, month] = fecha.split('-').map(Number);
                          if (year && month) void cargarDisponibilidad(year, month, opcion);
                        }}
                        accessibilityRole="radio"
                        accessibilityLabel={opcion}
                        accessibilityState={{ selected: elegida }}
                        style={({ pressed }) => [
                          styles.opcion,
                          elegida && styles.opcionSeleccionada,
                          pressed && estilos.buttonPressed,
                        ]}
                      >
                        <Text
                          style={[styles.opcionTexto, elegida && styles.opcionTextoSeleccionado]}
                        >
                          {opcion}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.bloqueCampo}>
                  <TurnoDateTimeField
                    tipo="fecha"
                    valor={fecha}
                    onChange={(valor) => {
                      setFecha(valor);
                      setHora('');
                    }}
                    onMonthChange={(year, month) => void cargarDisponibilidad(year, month, sede)}
                  />
                </View>

                <View style={styles.bloqueCampo}>
                  <TurnoDateTimeField
                    tipo="hora"
                    valor={hora}
                    onChange={setHora}
                    fechaSeleccionadaValor={fecha}
                    horariosOcupados={horariosOcupados}
                    cargandoDisponibilidad={cargandoDisponibilidad}
                    errorDisponibilidad={errorDisponibilidad}
                  />
                </View>
                {errorGuardado ? (
                  <Text style={styles.saveError} accessibilityRole="alert">
                    {errorGuardado}
                  </Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.confirmar,
                    pressed && estilos.buttonPressed,
                  ]}
                  onPress={() => void guardarCambios()}
                  disabled={guardando}
                  accessibilityRole="button"
                  accessibilityState={{ busy: guardando }}
                >
                  <Text style={styles.confirmarTexto}>
                    {guardando ? 'Guardando...' : 'Guardar cambios'}
                  </Text>
                </Pressable>

                {seleccionado.llegadaEn || seleccionado.atendidoEn ? (
                  <Text style={styles.cancelarBloqueado}>
                    {seleccionado.atendidoEn
                      ? 'Este turno ya fue atendido y no se puede cancelar.'
                      : 'Este paciente ya se presentó y no se puede cancelar.'}
                  </Text>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.cancelar, pressed && estilos.buttonPressed]}
                    onPress={() => {
                      setMotivoCancelacion('');
                      setErrorCancelar('');
                      setConfirmarCancelacion(true);
                    }}
                    disabled={cancelando}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancelar el turno de ${seleccionado.mascota.nombre}`}
                  >
                    <Ionicons name="close-circle-outline" size={19} color="#ffffff" />
                    <Text style={styles.cancelarTexto}>Cancelar turno</Text>
                  </Pressable>
                )}
                {errorCancelar ? (
                  <Text style={styles.saveError} accessibilityRole="alert">
                    {errorCancelar}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={confirmarCancelacion}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setConfirmarCancelacion(false)}
      >
        <View style={estilos.petModalRoot}>
          <Pressable
            style={estilos.petModalBackdrop}
            onPress={() => setConfirmarCancelacion(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar confirmación"
          />
          <View style={estilos.modalCard} accessibilityRole="alert">
            <Text style={estilos.modalTitle}>¿Cancelar el turno?</Text>
            <Text style={estilos.modalText}>
              Se elimina el turno de {seleccionado?.mascota.nombre ?? 'la mascota'} del{' '}
              {seleccionado ? `${fechaCorta(seleccionado.fecha)} a las ${seleccionado.hora} hs` : ''}{' '}
              y no se puede deshacer.
            </Text>

            <Text style={styles.motivoLabel}>Motivo de la cancelación</Text>
            <TextInput
              style={styles.motivoInput}
              placeholder="Ej. El profesional que iba a atenderla tuvo un imprevisto."
              placeholderTextColor="#7a8378"
              value={motivoCancelacion}
              onChangeText={setMotivoCancelacion}
              multiline
              numberOfLines={4}
              maxLength={400}
              textAlignVertical="top"
              autoFocus
              accessibilityLabel="Motivo de la cancelación del turno"
            />
            <Text style={styles.motivoAyuda}>
              Se le manda tal cual lo escribas al dueño, en la notificación.
            </Text>

            {errorCancelar ? (
              <Text style={styles.saveError} accessibilityRole="alert">
                {errorCancelar}
              </Text>
            ) : null}

            <View style={estilos.modalActions}>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  estilos.modalButtonNeutral,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => {
                  setConfirmarCancelacion(false);
                  setMotivoCancelacion('');
                  setErrorCancelar('');
                }}
                accessibilityRole="button"
                accessibilityLabel="No, volver sin cancelar"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextDark]}>No</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  estilos.modalButton,
                  styles.confirmarCancelacion,
                  pressed && estilos.buttonPressed,
                ]}
                onPress={() => void cancelarTurno()}
                disabled={cancelando}
                accessibilityRole="button"
                accessibilityLabel="Sí, cancelar el turno"
              >
                <Text style={[estilos.modalButtonText, estilos.modalButtonTextLight]}>
                  {cancelando ? 'Cancelando...' : 'Sí, cancelar'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AvisoExito
        visible={turnoGuardado !== null}
        titulo="¡Turno actualizado!"
        subtitulo={
          turnoGuardado !== null
            ? `Guardamos los cambios del turno de ${turnoGuardado.mascota}: ${turnoGuardado.texto}.`
            : undefined
        }
        etiquetaBoton="Cerrar el aviso de turno actualizado"
        onCerrar={() => setTurnoGuardado(null)}
      />

      <AvisoExito
        visible={turnoCancelado !== null}
        titulo="¡Turno cancelado!"
        subtitulo={
          turnoCancelado !== null
            ? `Se canceló el turno de ${turnoCancelado.mascota} del ${turnoCancelado.texto} y el cliente fue notificado.`
            : undefined
        }
        etiquetaBoton="Cerrar el aviso de turno cancelado"
        onCerrar={() => setTurnoCancelado(null)}
      />
    </AppDrawer>
  );
}

const styles = {
  pantalla: { flex: 1, backgroundColor: '#fffefc' },
  cabecera: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0 },
  bloqueSede: { marginBottom: 12 },
  labelSede: { marginBottom: 8, color: '#4d6154', fontSize: 13, fontWeight: '600' as const },
  filaSedes: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  sedeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 16,
    backgroundColor: '#fffefc',
  },
  sedeChipActivo: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  sedeTexto: { color: '#1e3326', fontSize: 13, fontWeight: '500' as const },
  sedeTextoActivo: { color: '#0f3e17', fontWeight: 'bold' as const },
  // El padding lateral tiene que ser el mismo que el de la cabecera para que la
  // tarjeta de la lista quede del mismo ancho que el calendario de arriba.
  listas: { flex: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  lista: {
    flex: 1,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dcecdc',
    borderRadius: 16,
    backgroundColor: '#f2f9f1',
    overflow: 'hidden' as const,
  },
  listaEncabezado: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 9 },
  listaFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  tituloSeccion: { marginTop: 0, marginBottom: 0, flex: 1 },
  subtituloSeccion: { marginBottom: 0 },
  listaContenido: { paddingHorizontal: 12, paddingBottom: 12 },
  cargandoLista: { paddingVertical: 20 },
  notaVacia: { paddingBottom: 8 },
  turnoFila: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: 64,
  },
  turnoFoto: { width: 56, height: 56, borderRadius: 12 },
  turnoTexto: { flex: 1 },
  dueno: { color: '#0f3e17', fontSize: 14, fontWeight: '600' as const },
  turnPhotoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 12,
    backgroundColor: '#e2f2e4',
  },
  turnoTitulo: { flexShrink: 1 },
  modalNombreMascota: { color: '#0f3e17', fontSize: 20, fontWeight: 'bold' as const, marginTop: 2 },
  saveError: { color: '#a32828', fontSize: 14, lineHeight: 20, marginTop: 10 },
  label: {
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 12,
    marginBottom: 6,
  },
  filaOpciones: { flexDirection: 'row' as const, gap: 6, marginBottom: 4 },
  opcion: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#fffefc',
  },
  opcionSeleccionada: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  opcionTexto: { color: '#1e3326', fontSize: 13, fontWeight: '500' as const },
  opcionTextoSeleccionado: { color: '#0f3e17', fontWeight: 'bold' as const },
  bloqueCampo: { marginTop: 12 },
  // Boton de cancelar: rojo, no verde. Es la unica accion de la pantalla que
  // borra algo, y verde se leeria como "guardar".
  cancelar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#a32828',
  },
  cancelarTexto: { color: '#ffffff', fontSize: 15, fontWeight: '600' as const },
  confirmarCancelacion: { backgroundColor: '#a32828' },
  motivoLabel: {
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600' as const,
    marginTop: 16,
    marginBottom: 6,
  },
  motivoInput: {
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 12,
    backgroundColor: '#f3f7f1',
    fontSize: 15,
    color: '#1e3326',
  },
  motivoAyuda: { marginTop: 6, color: '#69746a', fontSize: 12, lineHeight: 18 },
  cancelarBloqueado: {
    marginTop: 14,
    color: '#69746a',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center' as const,
  },
  confirmar: {
    alignItems: 'center' as const,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  confirmarTexto: { color: '#fffefc', fontSize: 15, fontWeight: 'bold' as const },
};