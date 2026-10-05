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
  keyboardType?: 'email-address' | 'phone-pad';
  secureTextEntry?: boolean;
  autoComplete?: 'name' | 'email';
  maxLength?: number;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
  esUltimo?: boolean;
};

export default function EditarPerfil() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

  const contenedor = useMemo(() => [estilos.formContent, { paddingTop: top }], [top]);

  const handleSubmit = () => {
    if (!nombre.trim() || !email.trim() || !telefono.trim()) {
      Alert.alert('Faltan datos', 'Completa tu nombre, tu correo y tu teléfono.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('Correo no válido', 'Revisa el formato de tu correo electrónico.');
      return;
    }
    Alert.alert(
      'Perfil completo',
      'Tus datos están listos. El guardado aún no funciona.'
    );
  };

  const campos: Campo[] = [
    {
      id: 'nombre',
      label: 'Nombre completo',
      placeholder: 'Ej. Ana Gómez',
      value: nombre,
      onChangeText: setNombre,
      autoComplete: 'name',
      returnKeyType: 'next',
    },
    {
      id: 'email',
      label: 'Correo electrónico',
      placeholder: 'Ej. ana@correo.com',
      value: email,
      onChangeText: setEmail,
      keyboardType: 'email-address',
      autoComplete: 'email',
      returnKeyType: 'next',
    },
    {
      id: 'telefono',
      label: 'Teléfono',
      placeholder: 'Ej. 5551234567',
      value: telefono,
      onChangeText: setTelefono,
      keyboardType: 'phone-pad',
      returnKeyType: 'next',
    },
    {
      id: 'direccion',
      label: 'Dirección',
      placeholder: 'Ej. Calle 123, Ciudad',
      value: direccion,
      onChangeText: setDireccion,
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
              autoComplete={item.autoComplete}
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
              <Text style={estilos.formTitle}>Editar perfil</Text>
              <Text style={estilos.formSubtitle}>Actualizá tus datos de contacto.</Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View style={estilos.formWrapper}>
            <Pressable
              style={({ pressed }) => [estilos.submitButton, pressed && estilos.buttonPressed]}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel="Guardar cambios"
            >
              <Text style={estilos.submitText}>Guardar cambios</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}