import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, usePathname } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const menuItems = [
  { label: 'VetPro', href: '/app', icon: 'home-outline' },
  { label: 'Mascotas', href: '/mascotas', icon: 'paw-outline' },
  { label: 'Turnos', href: '/turnos', icon: 'calendar-outline' },
  { label: 'Perfil', href: '/perfil', icon: 'person-outline' },
] as const;

type AppDrawerProps = {
  title: string;
  children: ReactNode;
};

export function AppDrawer({ title, children }: AppDrawerProps) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          style={styles.menuButton}
          onPress={() => setVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Abrir menú de navegación"
        >
          <Ionicons name="menu" size={28} color="#0f3e17" />
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
              <View style={styles.brandMark}>
                <Ionicons name="paw" size={21} color="#0f3e17" />
              </View>
              <Text style={styles.brandName}>VetPro</Text>
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

            {menuItems.map((item) => {
              const selected = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable
                    onPress={() => setVisible(false)}
                    style={StyleSheet.flatten([styles.menuItem, selected && styles.menuItemSelected])}
                    accessibilityRole="link"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={selected ? '#0f3e17' : '#555d54'}
                    />
                    <Text style={[styles.menuLabel, selected && styles.menuLabelSelected]}>
                      {item.label}
                    </Text>
                    {selected && <View style={styles.selectedIndicator} />}
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
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#e1f4df',
  },
  brandName: {
    flex: 1,
    color: '#0f3e17',
    fontSize: 18,
    fontWeight: 'bold',
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
  selectedIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0f3e17',
  },
});