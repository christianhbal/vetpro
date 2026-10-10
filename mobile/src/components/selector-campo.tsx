import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { estilos } from '@/lib/estilos';

export type OpcionSelector = {
  valor: string;
  titulo: string;
  detalle?: string;
  foto?: string | null;
};

type SelectorCampoProps = {
  label: string;
  icono: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  opciones: OpcionSelector[];
  seleccion: OpcionSelector | null;
  onSelect: (opcion: OpcionSelector) => void;
  cargando?: boolean;
  vacio?: string;
  accessibilityLabel: string;
  /** Oculta el subtitulo y achica el campo, para las columnas angostas. */
  compacto?: boolean;
};

/**
 * Campo de seleccion con hoja inferior propia. Se usa para sede y mascota
 * porque el Picker nativo no deja controlar la tipografia ni el avatar.
 */
export function SelectorCampo({
  label,
  icono,
  placeholder,
  opciones,
  seleccion,
  onSelect,
  cargando = false,
  vacio,
  accessibilityLabel,
  compacto = false,
}: SelectorCampoProps) {
  const [abierto, setAbierto] = useState(false);

  const activo = seleccion !== null;

  return (
    <View style={styles.campoBloque}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.campo,
          compacto && styles.campoCompacto,
          activo && styles.campoConValor,
          pressed && estilos.buttonPressed,
        ]}
        onPress={() => setAbierto(true)}
        disabled={cargando || (vacio !== undefined && opciones.length === 0)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: cargando, expanded: abierto }}
      >
        {seleccion?.foto !== undefined ? (
          seleccion.foto ? (
            <Image
              source={{ uri: seleccion.foto }}
              style={[styles.campoAvatar, compacto && styles.avatarCompacto]}
              resizeMode="cover"
              accessibilityLabel={`Foto de ${seleccion.titulo}`}
            />
          ) : (
            <View
              style={[styles.campoAvatar, compacto && styles.avatarCompacto, styles.campoAvatarVacio]}
            >
              <Ionicons name="paw" size={compacto ? 13 : 16} color="#5f7d63" />
            </View>
          )
        ) : (
          <View style={[styles.campoIcono, compacto && styles.campoIconoCompacto]}>
            <Ionicons name={icono} size={compacto ? 15 : 18} color="#0f3e17" />
          </View>
        )}

        <View style={styles.campoTextoBloque}>
          <Text
            style={[
              styles.campoTexto,
              compacto && styles.campoTextoCompacto,
              !activo && styles.campoTextoVacio,
            ]}
            numberOfLines={1}
          >
            {seleccion?.titulo ?? placeholder}
          </Text>
          {seleccion?.detalle && !compacto ? (
            <Text style={styles.campoDetalle} numberOfLines={1}>
              {seleccion.detalle}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-down" size={compacto ? 15 : 18} color="#7b8c7d" />
      </Pressable>

      {vacio !== undefined && !cargando && opciones.length === 0 ? (
        <Text style={styles.mensajeBloque}>{vacio}</Text>
      ) : null}

      <Modal
        visible={abierto}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setAbierto(false)}
      >
        <View style={styles.hojaRaiz}>
          <Pressable
            style={styles.hojaFondo}
            onPress={() => setAbierto(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar selección"
          />
          <View style={styles.hoja}>
            <View style={styles.hojaPestana} />
            <View style={styles.hojaEncabezado}>
              <Text style={styles.hojaTitulo}>{label}</Text>
              <Pressable
                onPress={() => setAbierto(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={({ pressed }) => [styles.hojaCerrar, pressed && estilos.buttonPressed]}
              >
                <Ionicons name="close" size={22} color="#263b32" />
              </Pressable>
            </View>

            <View style={styles.hojaOpciones}>
              {opciones.map((opcion) => {
                const elegida = seleccion?.valor === opcion.valor;
                return (
                  <Pressable
                    key={opcion.valor}
                    style={({ pressed }) => [
                      styles.opcion,
                      elegida && styles.opcionElegida,
                      pressed && estilos.buttonPressed,
                    ]}
                    onPress={() => {
                      onSelect(opcion);
                      setAbierto(false);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: elegida }}
                    accessibilityLabel={
                      opcion.detalle ? `${opcion.titulo}, ${opcion.detalle}` : opcion.titulo
                    }
                  >
                    {opcion.foto !== undefined ? (
                      opcion.foto ? (
                        <Image
                          source={{ uri: opcion.foto }}
                          style={styles.opcionAvatar}
                          resizeMode="cover"
                          accessibilityLabel={`Foto de ${opcion.titulo}`}
                        />
                      ) : (
                        <View style={[styles.opcionAvatar, styles.campoAvatarVacio]}>
                          <Ionicons name="paw" size={20} color="#5f7d63" />
                        </View>
                      )
                    ) : (
                      <View style={[styles.opcionAvatar, styles.opcionAvatarIcono]}>
                        <Ionicons name={icono} size={19} color="#0f3e17" />
                      </View>
                    )}

                    <View style={styles.opcionTextoBloque}>
                      <Text style={[styles.opcionTitulo, elegida && styles.opcionTituloElegido]}>
                        {opcion.titulo}
                      </Text>
                      {opcion.detalle ? (
                        <Text style={styles.opcionDetalle}>{opcion.detalle}</Text>
                      ) : null}
                    </View>

                    {elegida ? (
                      <View style={styles.opcionCheck}>
                        <Ionicons name="checkmark" size={15} color="#fffefc" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  campoBloque: { marginBottom: 10 },
  label: {
    marginBottom: 6,
    color: '#4d6154',
    fontSize: 13,
    fontWeight: '600',
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#cfdcc9',
    borderRadius: 14,
    backgroundColor: '#fffefc',
  },
  campoCompacto: {
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 12,
  },
  campoConValor: { borderColor: '#a8c3a4', backgroundColor: '#ffffff' },
  campoIcono: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#e4f1e0',
  },
  campoIconoCompacto: { width: 28, height: 28, borderRadius: 9 },
  campoAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e4f1e0' },
  avatarCompacto: { width: 28, height: 28, borderRadius: 14 },
  campoAvatarVacio: { alignItems: 'center', justifyContent: 'center' },
  campoTextoBloque: { flex: 1 },
  campoTexto: { color: '#1e3326', fontSize: 16, fontWeight: '600' },
  campoTextoCompacto: { fontSize: 14 },
  campoTextoVacio: { color: '#8b978c', fontWeight: '500' },
  campoDetalle: { marginTop: 2, color: '#77847a', fontSize: 13 },
  hojaRaiz: { flex: 1, justifyContent: 'flex-end' },
  hojaFondo: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 32, 22, 0.45)' },
  hoja: {
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingBottom: 30,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#fffefc',
  },
  hojaPestana: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    marginTop: 10,
    borderRadius: 3,
    backgroundColor: '#d3ded0',
  },
  hojaEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  hojaTitulo: {
    color: '#0f3e17',
    fontSize: 19,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  hojaCerrar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#eef4ea',
  },
  hojaOpciones: { gap: 8 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 11,
    borderWidth: 1.5,
    borderColor: '#e2e9de',
    borderRadius: 14,
    backgroundColor: '#fbfdf9',
  },
  opcionElegida: { borderColor: '#0f3e17', backgroundColor: '#e8f3e4' },
  opcionAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e4f1e0' },
  opcionAvatarIcono: { alignItems: 'center', justifyContent: 'center' },
  opcionTextoBloque: { flex: 1 },
  opcionTitulo: { color: '#1e3326', fontSize: 16, fontWeight: '600' },
  opcionTituloElegido: { color: '#0f3e17', fontWeight: 'bold' },
  opcionDetalle: { marginTop: 2, color: '#77847a', fontSize: 13 },
  opcionCheck: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#0f3e17',
  },
  mensajeBloque: {
    color: '#6f7d72',
    fontSize: 13,
    lineHeight: 19,
  },
});