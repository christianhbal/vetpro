# VetPro

La aplicación tiene un backend Express con Prisma y SQLite, y un frontend Expo en `mobile`.

## Backend

Desde la carpeta `backend`:

```bash
npm install
npm run db:init
npm run dev
```

En `backend/.env` se configura la base de datos, por ejemplo:

```env
DATABASE_URL="file:./dev.db"
```

La API escucha por defecto en el puerto 3000. Se puede comprobar su conexión con la base en `http://localhost:3000/api/health`.

## Aplicación

Desde la carpeta `mobile`:

```bash
npm install
npx expo start
```

Para usar un teléfono físico, configurá `EXPO_PUBLIC_API_URL` en `mobile/.env` con la dirección IP de la computadora en la red local y el puerto de la API, por ejemplo `http://192.168.1.44:3000`. El teléfono y la computadora deben poder comunicarse por la misma red. Reiniciá Expo si cambiás el archivo `.env`. La dirección puede cambiar según la red.

## Usuarios y sedes

El registro crea usuarios clientes. Para configurar el primer administrador, registrá una cuenta y ejecutá desde `backend`:

```bash
npm run admin:promote -- correo@ejemplo.com
```

Iniciá sesión nuevamente después de promover la cuenta. Las demás cuentas administradoras y las sedes se gestionan desde la aplicación. Los horarios de atención y los datos iniciales de las sedes deben revisarse en Administrar sedes antes de usarlos.

Los recordatorios del teléfono son notificaciones locales. Se sincronizan cuando se abre la aplicación y después de las acciones del cliente; no hay notificaciones push ni consultas periódicas desde el celular. Los avisos dentro de la app se consultan al entrar o refrescar la pantalla.
