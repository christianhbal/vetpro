import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  tipo: 'fecha' | 'hora';
  valor: string;
  onChange: (value: string) => void;
  fechaSeleccionadaValor?: string;
  horariosOcupados?: { fecha: string; hora: string }[];
  cargandoDisponibilidad?: boolean;
  errorDisponibilidad?: string;
  onMonthChange?: (year: number, month: number) => void;
};

const horariosDisponibles = Array.from({ length: 18 }, (_value, index) => {
  const minutos = 10 * 60 + index * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
});

function fechaDesdeValor(valor: string): Date {
  const [year, month, day] = valor.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : new Date();
}

function fechaComoValor(fecha: Date): string {
  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
}

function diasDelMes(fecha: Date): (number | null)[] {
  const year = fecha.getFullYear();
  const month = fecha.getMonth();
  const espacios = (new Date(year, month, 1).getDay() + 6) % 7;
  const dias = new Date(year, month + 1, 0).getDate();
  return [
    ...Array<number | null>(espacios).fill(null),
    ...Array.from({ length: dias }, (_value, index) => index + 1),
  ];
}

export default function TurnoDateTimeField({
  tipo,
  valor,
  onChange,
  fechaSeleccionadaValor = '',
  horariosOcupados = [],
  cargandoDisponibilidad = false,
  errorDisponibilidad = '',
  onMonthChange,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [mesVisible, setMesVisible] = useState(() => fechaDesdeValor(valor));
  const esFecha = tipo === 'fecha';
  const fechaSeleccionada = useMemo(
    () => fechaDesdeValor(esFecha ? valor : fechaSeleccionadaValor),
    [esFecha, fechaSeleccionadaValor, valor]
  );
  const dias = useMemo(() => diasDelMes(mesVisible), [mesVisible]);
  const horariosOcupadosDia = useMemo(
    () =>
      new Set(
        horariosOcupados
          .filter((slot) => slot.fecha === fechaSeleccionadaValor)
          .map((slot) => slot.hora)
      ),
    [fechaSeleccionadaValor, horariosOcupados]
  );

  const abrir = () => {
    if (esFecha) {
      setMesVisible(fechaSeleccionada);
      onMonthChange?.(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth() + 1);
    }
    setAbierto(true);
  };

  const moverMes = (cantidad: number) => {
    const siguiente = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + cantidad, 1);
    setMesVisible(siguiente);
    onMonthChange?.(siguiente.getFullYear(), siguiente.getMonth() + 1);
  };

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={esFecha ? 'Abrir calendario' : 'Elegir horario'}
      >
        <Ionicons name={esFecha ? 'calendar-outline' : 'time-outline'} size={20} color="#0f3e17" />
        <Text style={[styles.fieldText, !valor && styles.placeholder]}>
          {valor
            ? esFecha
              ? fechaSeleccionada.toLocaleDateString('es-AR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : valor
            : esFecha
              ? 'Seleccionar fecha'
              : 'Seleccionar horario'}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#555d54" />
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        onRequestClose={() => setAbierto(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setAbierto(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar selector"
          />
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.title}>{esFecha ? 'Elegir fecha' : 'Elegir horario'}</Text>
              <Pressable
                onPress={() => setAbierto(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
            </View>

            {esFecha ? (
              <>
                <View style={styles.monthRow}>
                  <Pressable
                    onPress={() => moverMes(-1)}
                    accessibilityRole="button"
                    accessibilityLabel="Mes anterior"
                    style={styles.arrow}
                  >
                    <Ionicons name="chevron-back" size={22} color="#0f3e17" />
                  </Pressable>
                  <Text style={styles.month}>
                    {mesVisible.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                  </Text>
                  <Pressable
                    onPress={() => moverMes(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Mes siguiente"
                    style={styles.arrow}
                  >
                    <Ionicons name="chevron-forward" size={22} color="#0f3e17" />
                  </Pressable>
                </View>
                <View style={styles.calendar}>
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, index) => (
                    <Text key={`semana-${index}`} style={styles.weekday}>{dia}</Text>
                  ))}
                  {dias.map((dia, index) => {
                    if (dia === null) return <View key={`espacio-${index}`} style={styles.day} />;
                    const fechaDia = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia);
                    const fechaValor = fechaComoValor(fechaDia);
                    const esPasado = fechaDia < new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      new Date().getDate()
                    );
                    const esDomingo = fechaDia.getDay() === 0;
                    const horariosDelDia = new Set(
                      horariosOcupados
                        .filter(
                          (slot) =>
                            slot.fecha === fechaValor && horariosDisponibles.includes(slot.hora)
                        )
                        .map((slot) => slot.hora)
                    );
                    const completo = horariosDelDia.size >= horariosDisponibles.length;
                    const deshabilitado =
                      esPasado ||
                      esDomingo ||
                      completo ||
                      cargandoDisponibilidad ||
                      Boolean(errorDisponibilidad);
                    const seleccionado =
                      fechaSeleccionada.getFullYear() === mesVisible.getFullYear() &&
                      fechaSeleccionada.getMonth() === mesVisible.getMonth() &&
                      fechaSeleccionada.getDate() === dia;
                    return (
                      <Pressable
                        key={`dia-${dia}`}
                        style={[
                          styles.day,
                          seleccionado && styles.selectedDay,
                          deshabilitado && styles.disabledDay,
                        ]}
                        disabled={deshabilitado}
                        onPress={() => {
                          onChange(fechaValor);
                          setAbierto(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: seleccionado }}
                        accessibilityLabel={`${dia} de ${mesVisible.toLocaleDateString('es-AR', { month: 'long' })}${horariosDelDia.size > 0 ? `, ${horariosDelDia.size} horarios ocupados` : ''}${deshabilitado ? ', no disponible' : ''}`}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            seleccionado && styles.selectedText,
                            deshabilitado && styles.disabledText,
                          ]}
                        >
                          {dia}
                        </Text>
                        {horariosDelDia.size > 0 && !seleccionado ? (
                          <View style={styles.occupiedDot} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.legend}>
                  <View style={styles.occupiedDot} />
                  <Text style={styles.legendText}>Fecha con horarios ocupados</Text>
                </View>
                {cargandoDisponibilidad ? (
                  <Text style={styles.availabilityMessage}>Cargando disponibilidad...</Text>
                ) : errorDisponibilidad ? (
                  <Text style={styles.availabilityMessage}>{errorDisponibilidad}</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.slotSubtitle}>
                  {valor
                    ? `Horarios para el ${fechaSeleccionada.toLocaleDateString('es-AR')}`
                    : 'Primero selecciona una fecha.'}
                </Text>
                {!valor ? (
                  <Text style={styles.availabilityMessage}>Selecciona una fecha para ver los horarios.</Text>
                ) : cargandoDisponibilidad ? (
                  <Text style={styles.availabilityMessage}>Cargando disponibilidad...</Text>
                ) : errorDisponibilidad ? (
                  <Text style={styles.availabilityMessage}>{errorDisponibilidad}</Text>
                ) : horariosDisponibles.every((horario) => horariosOcupadosDia.has(horario)) ? (
                  <Text style={styles.availabilityMessage}>No quedan horarios disponibles para esta fecha.</Text>
                ) : (
                  <ScrollView style={styles.slotsScroll}>
                    <View style={styles.slotsGrid}>
                      {horariosDisponibles.map((horario) => {
                        const ocupado = horariosOcupadosDia.has(horario);
                        const pasadoHoy =
                          fechaSeleccionadaValor === fechaComoValor(new Date()) &&
                          horario <= `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
                        const deshabilitado =
                          ocupado ||
                          pasadoHoy ||
                          cargandoDisponibilidad ||
                          Boolean(errorDisponibilidad);
                        const seleccionado = valor === horario;
                        return (
                          <Pressable
                            key={horario}
                            disabled={deshabilitado}
                            onPress={() => {
                              onChange(horario);
                              setAbierto(false);
                            }}
                            style={[
                              styles.slot,
                              seleccionado && styles.selectedDay,
                              deshabilitado && styles.disabledSlot,
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: seleccionado, disabled: deshabilitado }}
                            accessibilityLabel={`${horario}${ocupado ? ', ocupado' : deshabilitado ? ', no disponible' : ', disponible'}`}
                          >
                            <Text
                              style={[
                                styles.slotText,
                                seleccionado && styles.selectedText,
                                deshabilitado && styles.disabledText,
                              ]}
                            >
                              {horario}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 52,
    marginBottom: 20,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#b9cbb6',
    borderRadius: 10,
    backgroundColor: '#f3f7f1',
  },
  fieldText: { flex: 1, color: '#263b32', fontSize: 16, textTransform: 'capitalize' },
  placeholder: { color: '#7a8378', textTransform: 'none' },
  pressed: { opacity: 0.75 },
  modalRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 32, 22, 0.45)' },
  modal: {
    width: '100%',
    maxWidth: 390,
    padding: 20,
    borderRadius: 18,
    backgroundColor: '#fffefc',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#0f3e17', fontSize: 20, fontWeight: 'bold' },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  month: { color: '#263b32', fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', paddingVertical: 8, color: '#69746a', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  day: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  dayText: { color: '#263b32', fontSize: 15, textAlign: 'center' },
  disabledDay: { backgroundColor: '#f0f1ee' },
  disabledText: { color: '#a0a69f' },
  occupiedDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#c05a32', position: 'absolute', bottom: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  legendText: { color: '#69746a', fontSize: 13 },
  availabilityMessage: { color: '#69746a', fontSize: 14, textAlign: 'center', marginVertical: 18 },
  slotSubtitle: { color: '#69746a', fontSize: 14, marginTop: 12 },
  slotsScroll: { maxHeight: 300, marginTop: 12 },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  slot: { width: '30%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#e1f4df' },
  disabledSlot: { backgroundColor: '#f0f1ee' },
  slotText: { color: '#0f3e17', fontSize: 14, fontWeight: '600' },
  selectedDay: { backgroundColor: '#0f3e17' },
  selectedText: { color: '#fffefc', fontWeight: 'bold' },
  timeColumns: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 },
  timeColumn: { width: 90, alignItems: 'center' },
  columnLabel: { marginBottom: 8, color: '#69746a', fontSize: 14, fontWeight: '600' },
  timeScroll: { height: 230, width: '100%' },
  timeChoices: { alignItems: 'center', gap: 4 },
  timeChoice: { width: 64, paddingVertical: 10, borderRadius: 9 },
  colon: { marginTop: 16, color: '#0f3e17', fontSize: 24, fontWeight: 'bold' },
  confirm: { alignItems: 'center', marginTop: 16, padding: 14, borderRadius: 10, backgroundColor: '#0f3e17' },
  confirmText: { color: '#fffefc', fontSize: 16, fontWeight: 'bold' },
});
