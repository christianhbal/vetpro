import { useCallback, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect, usePathname } from 'expo-router';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { API_BASE_URL } from '@/lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { obtenerUsuarioActual } from '@/lib/session';

const menuItems = [
  { label: 'VetPro', href: '/app', icon: 'home-outline' },
  { label: 'Mascotas', href: '/mascotas', icon: 'paw-outline' },
  { label: 'Turnos', href: '/turnos', icon: 'calendar-outline' },
  { label: 'Notificaciones', href: '/notificaciones', icon: 'notifications-outline' },
  { label: 'Perfil', href: '/perfil', icon: 'person-outline' },
] as const;

const adminMenuItems = [
  { label: 'Administrar usuarios', href: '/admin-usuarios', icon: 'people-outline' },
  { label: 'Modificar turnos', href: '/admin-turnos', icon: 'calendar-number-outline' },
  { label: 'Turnos activos', href: '/admin-turnos-activos', icon: 'checkmark-circle-outline' },
] as const;

type AppDrawerProps = {
  title: string;
  children: ReactNode;
  /** Si se pasa, la barra superior muestra una flecha en vez del menu. */
  onVolver?: () => void;
  etiquetaVolver?: string;
};

export function AppDrawer({ title, children, onVolver, etiquetaVolver }: AppDrawerProps) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [esAdmin, setEsAdmin] = useState(false);
  const [notificacionesSinLeer, setNotificacionesSinLeer] = useState(0);

  const cargarContadorNotificaciones = useCallback(async () => {
    try {
      const usuario = await obtenerUsuarioActual();
      setEsAdmin(usuario?.esAdmin === true);
      if (!usuario || usuario.esAdmin) {
        setNotificacionesSinLeer(0);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${usuario.accessToken}` },
      });
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargarContadorNotificaciones();
    }, [cargarContadorNotificaciones])
  );

  const items = esAdmin
    ? [...menuItems, ...adminMenuItems].filter((item) => item.href !== '/mascotas')
    : menuItems;
  const abrirMenu = () => {
    setVisible(true);
    void cargarContadorNotificaciones();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
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

      {visible && (
        <View style={styles.drawerOverlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú"
          />
          <View style={[styles.drawer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.drawerHeader}>
              <Image
                source={require('../../assets/images/vetpro-logo-horizontal.jpg')}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="VetPro, cuidado y bienestar"
              />
              <Pressable
                style={styles.closeButton}
                onPress={() => setVisible(false)}
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
                    onPress={() => setVisible(false)}
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
          </View>
        </View>
      )}
    </View>
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