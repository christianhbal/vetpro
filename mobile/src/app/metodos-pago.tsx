import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { estilos } from '@/lib/estilos';

type Campo = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (texto: string) => void;
  keyboardType?: 'number-pad' | 'phone-pad';
  secureTextEntry?: boolean;
  maxLength?: number;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  esUltimo?: boolean;
};

export default function MetodosPago() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const [tarjeta, setTarjeta] = useState('');
  const [titular, setTitular] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [cvv, setCvv] = useState('');

  const contenedor = useMemo(() => [estilos.formContent, { paddingTop: top }], [top]);

  const handleSubmit = () => {
    if (!tarjeta.trim() || !titular.trim() || !vencimiento.trim() || !cvv.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos de la tarjeta.');
      return;
    }
    if (tarjeta.trim().length < 16) {
      Alert.alert('Tarjeta inválida', 'El número de tarjeta debe tener 16 dígitos.');
      return;
    }
    if (cvv.trim().length < 3) {
      Alert.alert('CVV inválido', 'El código de seguridad debe tener al menos 3 dígitos.');
      return;
    }
    Alert.alert(
      'Tarjeta completa',
      'Los datos están listos. El guardado aún no funciona.'
    );
  };

  const campos: Campo[] = [
    {
      id: 'tarjeta',
      label: 'Número de tarjeta',
      placeholder: 'Ej. 4111111111111111',
      value: tarjeta,
      onChangeText: setTarjeta,
      keyboardType: 'number-pad',
      maxLength: 16,
      returnKeyType: 'next',
    },
    {
      id: 'titular',
      label: 'Titular',
      placeholder: 'Ej. Ana Gómez',
      value: titular,
      onChangeText: setTitular,
      returnKeyType: 'next',
    },
    {
      id: 'vencimiento',
      label: 'Vencimiento',
      placeholder: 'MM/AA',
      value: vencimiento,
      onChangeText: setVencimiento,
      keyboardType: 'number-pad',
      maxLength: 5,
      returnKeyType: 'next',
    },
    {
      id: 'cvv',
      label: 'CVV',
      placeholder: '123',
      value: cvv,
      onChangeText: setCvv,
      keyboardType: 'number-pad',
      secureTextEntry: true,
      maxLength: 4,
      returnKeyType: 'done',
      onSubmitEditing: handleSubmit,
      esUltimo: true,
    },
  ];

  return (
    <View style={estilos.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <FlatList
        data={campos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={contenedor}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={estilos.formWrapper}>
            <Text style={estilos.formLabel}>{item.label}</Text>
            <TextInput
              style={[estilos.formInput, !item.esUltimo && estilos.formInputUltimo]}
              placeholder={item.placeholder}
              placeholderTextColor="#7a8378"
              value={item.value}
              onChangeText={item.onChangeText}
              keyboardType={item.keyboardType}
              secureTextEntry={item.secureTextEntry}
              maxLength={item.maxLength}
              returnKeyType={item.returnKeyType}
              onSubmitEditing={item.onSubmitEditing}
            />
          </View>
        )}
        ListHeaderComponent={
          <View>
            <Pressable
              style={({ pressed }) => [estilos.backButton, pressed && estilos.buttonPressed]}
              onPress={() => router.replace('/perfil')}
              accessibilityRole="button"
              accessibilityLabel="Volver a Perfil"
            >
              <Ionicons name="arrow-back" size={20} color="#0f3e17" />
              <Text style={estilos.backText}>Perfil</Text>
            </Pressable>

            <View style={estilos.formWrapper}>
              <Text style={estilos.formTitle}>Métodos de pago</Text>
              <Text style={estilos.formSubtitle}>Agregá una tarjeta para tus pagos.</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={estilos.formWrapper}>
            <Pressable
              style={({ pressed }) => [estilos.submitButton, pressed && estilos.buttonPressed]}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel="Guardar tarjeta"
            >
              <Text style={estilos.submitText}>Guardar tarjeta</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}