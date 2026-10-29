import { consultarNotificaciones } from '@/lib/notificaciones';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, usePathname } from 'expo-router';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSesion } from '@/lib/sesion-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const itemPerfil = { label: 'Perfil', href: '/perfil', icon: 'person-outline' } as const;
const itemNotificaciones = {
  label: 'Notificaciones',
  href: '/notificaciones',
  icon: 'notifications-outline',
} as const;

const menuItems = [
  { label: 'VetPro', href: '/app', icon: 'home-outline' },
  { label: 'Mascotas', href: '/mascotas', icon: 'paw-outline' },
  { label: 'Turnos', href: '/turnos', icon: 'calendar-outline' },
  itemNotificaciones,
  itemPerfil,
] as const;

const adminMenuItems = [
  { label: 'Administrar usuarios', href: '/admin-usuarios', icon: 'people-outline' },
  { label: 'Administrar sedes', href: '/admin-sedes', icon: 'business-outline' },
] as const;

type AppDrawerProps = {
  title: string;
  children: ReactNode;
  /** Si se pasa, la barra superior muestra una flecha en vez del menu. */
  onVolver?: () => void;
  etiquetaVolver?: string;
};

export function AppDrawer({ title, children, onVolver, etiquetaVolver }: AppDrawerProps) {
  const { usuario: usuarioSesion } = useSesion();
  const [visible, setVisible] = useState(false);
  const desplazamiento = useRef(new Animated.Value(-340)).current;

  useEffect(() => {
    if (!visible) return;
    const animacion = Animated.timing(desplazamiento, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    });
    animacion.start();
    return () => animacion.stop();
  }, [visible, desplazamiento]);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const esAdmin = usuarioSesion?.esAdmin === true;
  const [enFoco, setEnFoco] = useState(false);
  const [notificacionesSinLeer, setNotificacionesSinLeer] = useState(0);

  const cargarContadorNotificaciones = useCallback(async () => {
    try {
      const usuario = usuarioSesion;
      if (!usuario || usuario.esAdmin) {
        setNotificacionesSinLeer(0);
        return;
      }

      const response = await consultarNotificaciones(usuario);
      if (!response.ok) {
        throw new Error(`No se pudo consultar el contador (HTTP ${response.status}).`);
      }

      const result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('unreadCount' in result) ||
        typeof result.unreadCount !== 'number' ||
        !Number.isInteger(result.unreadCount) ||
        result.unreadCount < 0
      ) {
        throw new Error('La API devolvió un contador de notificaciones inválido.');
      }
      setNotificacionesSinLeer(result.unreadCount);
    } catch (error: unknown) {
      console.error('No se pudo actualizar el contador de notificaciones:', error);
    }
  }, [usuarioSesion]);

  useFocusEffect(
    useCallback(() => {
      setEnFoco(true);
      setVisible(false);
      desplazamiento.setValue(-340);
      void cargarContadorNotificaciones();
      return () => {
        setEnFoco(false);
        desplazamiento.stopAnimation();
      };
    }, [cargarContadorNotificaciones, desplazamiento])
  );

  // El admin ve Notificaciones y Perfil al final, debajo de sus secciones de
  // administracion: son pantallas personales, no herramientas de la veterinaria.
  // Para el cliente quedan donde estan, que ya es la cola del menu.
  const items = esAdmin
    ? [
        ...menuItems.filter(
          (item) =>
            item.href !== '/mascotas' &&
            item.href !== itemNotificaciones.href &&
            item.href !== itemPerfil.href
        ),
        ...adminMenuItems,
        itemNotificaciones,
        itemPerfil,
      ]
    : menuItems;
  const abrirMenu = () => {
    if (onVolver || !usuarioSesion) return;
    setVisible(true);
    void cargarContadorNotificaciones();
  };
  const cerrarMenu = () => {
    Animated.timing(desplazamiento, {
      toValue: -340,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  };
  // Solo el enlace al valor animado va fuera de StyleSheet: no es un tamaño fijo.
  const movimientoMenu = { transform: [{ translateX: desplazamiento }] };
  const espaciosSeguros = StyleSheet.create({
    header: { paddingTop: insets.top },
    drawer: { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
  });

  // Solo empieza desde el borde al abrir; con el menú abierto se puede cerrar
  // desde toda la superficie. Los movimientos verticales quedan para el scroll.
  const gestoMenu = Gesture.Pan()
    // Sin Reanimated: los callbacks JS solo deciden abrir/cerrar al finalizar.
    .runOnJS(true)
    .enabled(!onVolver && enFoco && !!usuarioSesion)
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .onTouchesDown((evento, estado) => {
      if (!visible && (evento.changedTouches[0]?.x ?? 29) > 28) estado.fail();
    })
    .onEnd((evento) => {
      if (!visible && evento.translationX > 60) abrirMenu();
      if (visible && evento.translationX < -60) cerrarMenu();
    });

  return (
    <GestureDetector gesture={gestoMenu}>
    <View style={styles.container}>
      <View style={[styles.header, espaciosSeguros.header]}>
        <Pressable
          style={styles.menuButton}
          onPress={onVolver ?? abrirMenu}
          accessibilityRole="button"
          accessibilityLabel={onVolver ? etiquetaVolver ?? 'Volver' : 'Abrir menú de navegación'}
        >
          <Ionicons
            name={onVolver ? 'arrow-back' : 'menu'}
            size={onVolver ? 24 : 28}
            color="#0f3e17"
          />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>{children}</View>

      {visible && !onVolver && (
        <View style={styles.drawerOverlay}>
          <Pressable
            style={styles.backdrop}
            onPress={cerrarMenu}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú"
          />
          <Animated.View style={[styles.drawer, espaciosSeguros.drawer, movimientoMenu]}>
            <View style={styles.drawerHeader}>
              <Image
                source={require('../../assets/images/vetpro-logo-horizontal.jpg')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="VetPro, cuidado y bienestar"
              />
              <Pressable
                style={styles.closeButton}
                onPress={cerrarMenu}
                accessibilityRole="button"
                accessibilityLabel="Cerrar menú"
              >
                <Ionicons name="close" size={24} color="#263b32" />
              </Pressable>
            </View>

            <View style={styles.divider} />

            {items.map((item) => {
              const selected = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable
                    onPress={cerrarMenu}
                    style={StyleSheet.flatten([
                      styles.menuItem,
                      selected && styles.menuItemSelected,
                    ])}
                    accessibilityRole="link"
                    accessibilityState={{ selected }}
                    accessibilityLabel={
                      item.href === '/notificaciones' && notificacionesSinLeer > 0
                        ? `${item.label}, ${notificacionesSinLeer} sin leer`
                        : item.label
                    }
                  >
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={selected ? '#0f3e17' : '#555d54'}
                    />
                    <Text style={[styles.menuLabel, selected && styles.menuLabelSelected]}>
                      {item.label}
                    </Text>
                    {item.href === '/notificaciones' && notificacionesSinLeer > 0 ? (
                      <View style={styles.notificationBadge}>
                        <Text style={styles.notificationBadgeText}>
                          {notificacionesSinLeer > 99 ? '99+' : notificacionesSinLeer}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                </Link>
              );
            })}
          </Animated.View>
        </View>
      )}
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffefc',
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d8e3d5',
    backgroundColor: '#fffefc',
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    color: '#0f3e17',
    fontSize: 19,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    flexDirection: 'row',
    zIndex: 10,
    elevation: 10,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18, 32, 22, 0.38)',
  },
  drawer: {
    width: '82%',
    maxWidth: 320,
    backgroundColor: '#fffefc',
    paddingHorizontal: 18,
    elevation: 12,
    shadowColor: '#132719',
    shadowOffset: { width: 3, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  drawerHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    flex: 1,
    height: 62,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d8e3d5',
    marginVertical: 16,
  },
  menuItem: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
  },
  menuItemSelected: {
    backgroundColor: '#e1f4df',
  },
  menuLabel: {
    flex: 1,
    color: '#263b32',
    fontSize: 16,
    fontWeight: '500',
  },
  menuLabelSelected: {
    color: '#0f3e17',
    fontWeight: 'bold',
  },
  notificationBadge: {
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#c62828',
  },
  notificationBadgeText: {
    color: '#fffefc',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
