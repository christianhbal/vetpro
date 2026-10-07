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
};

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

export default function TurnoDateTimeField({ tipo, valor, onChange }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [mesVisible, setMesVisible] = useState(() => fechaDesdeValor(valor));
  const [horaSeleccionada, setHoraSeleccionada] = useState(() => Number(valor.split(':')[0]) || 10);
  const [minutoSeleccionado, setMinutoSeleccionado] = useState(() => Number(valor.split(':')[1]) || 0);
  const esFecha = tipo === 'fecha';
  const fechaSeleccionada = useMemo(() => fechaDesdeValor(valor), [valor]);
  const dias = useMemo(() => diasDelMes(mesVisible), [mesVisible]);

  const abrir = () => {
    if (esFecha) {
      setMesVisible(fechaSeleccionada);
    } else {
      const [hora, minuto] = valor.split(':').map(Number);
      setHoraSeleccionada(Number.isInteger(hora) ? hora : 10);
      setMinutoSeleccionado(Number.isInteger(minuto) ? minuto : 0);
    }
    setAbierto(true);
  };

  const moverMes = (cantidad: number) => {
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + cantidad, 1));
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
                    const seleccionado =
                      fechaSeleccionada.getFullYear() === mesVisible.getFullYear() &&
                      fechaSeleccionada.getMonth() === mesVisible.getMonth() &&
                      fechaSeleccionada.getDate() === dia;
                    return (
                      <Pressable
                        key={`dia-${dia}`}
                        style={[styles.day, seleccionado && styles.selectedDay]}
                        onPress={() => {
                          onChange(fechaComoValor(
                            new Date(mesVisible.getFullYear(), mesVisible.getMonth(), dia)
                          ));
                          setAbierto(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: seleccionado }}
                        accessibilityLabel={`${dia} de ${mesVisible.toLocaleDateString('es-AR', { month: 'long' })}`}
                      >
                        <Text style={[styles.dayText, seleccionado && styles.selectedText]}>
                          {dia}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={styles.timeColumns}>
                  <View style={styles.timeColumn}>
                    <Text style={styles.columnLabel}>Hora</Text>
                    <ScrollView style={styles.timeScroll} contentContainerStyle={styles.timeChoices}>
                      {Array.from({ length: 24 }, (_value, hour) => (
                        <Pressable
                          key={`hora-${hour}`}
                          onPress={() => setHoraSeleccionada(hour)}
                          style={[styles.timeChoice, horaSeleccionada === hour && styles.selectedDay]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: horaSeleccionada === hour }}
                        >
                          <Text style={[styles.dayText, horaSeleccionada === hour && styles.selectedText]}>
                            {String(hour).padStart(2, '0')}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  <Text style={styles.colon}>:</Text>
                  <View style={styles.timeColumn}>
                    <Text style={styles.columnLabel}>Minutos</Text>
                    <ScrollView style={styles.timeScroll} contentContainerStyle={styles.timeChoices}>
                      {Array.from({ length: 2 }, (_value, index) => index * 30).map((minute) => (
                        <Pressable
                          key={`minuto-${minute}`}
                          onPress={() => setMinutoSeleccionado(minute)}
                          style={[styles.timeChoice, minutoSeleccionado === minute && styles.selectedDay]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: minutoSeleccionado === minute }}
                        >
                          <Text style={[styles.dayText, minutoSeleccionado === minute && styles.selectedText]}>
                            {String(minute).padStart(2, '0')}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
                <Pressable
                  style={styles.confirm}
                  onPress={() => {
                    onChange(
                      `${String(horaSeleccionada).padStart(2, '0')}:${String(minutoSeleccionado).padStart(2, '0')}`
                    );
                    setAbierto(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmText}>Usar horario</Text>
                </Pressable>
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
