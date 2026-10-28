# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## User registration API

The registration form sends an account to the local SQLite database through the backend. Start the backend from `backend/`:

```bash
npm run db:init
npm run dev
```

The backend loads its configuration from `backend/.env`. After it starts, verify the API and database at `http://localhost:3000/api/health`; a healthy response is `{"ok":true}`.

The SQLite database is `backend/prisma/dev.db`; `backend/prisma/dev.db.backup` is a copy of the current database. The backend initializes the schema with `prisma db push`, so avoid `prisma migrate` for this class project; migrations create the `_prisma_migrations` metadata table. `createdAt` is stored as readable SQLite text with `CURRENT_TIMESTAMP`.

The user records are stored in the SQLite table `Usuario`.

After login, the app keeps the current user locally and uses its ID to create and list that user's pets. Pets created before the owner relationship have no user and do not appear in the list. A selected pet photo is stored as a Base64 data URL in SQLite.

The account phone number is required. The home screen shows a thumbnail of each pet's photo.

Appointments are stored in the `Turno` table and linked to both the signed-in user and one of that user's pets. The Turnos screen and home page show only saved upcoming appointments; past appointments appear in History. Appointment slots follow the days and hours configured in Administrar sedes, in 30-minute intervals; availability is tracked separately for each veterinary location. The calendar marks dates with occupied slots and unavailable dates/times cannot be selected. The backend enforces the same schedule and prevents booking an occupied date/time at the selected location. When notifications are requested, the backend creates an in-app reminder for eligible appointments within the next hour; no periodic server check runs. On Android and iOS the app schedules a local reminder one hour before, after notification permission is granted. A user can scan the arrival QR shown on the admin home screen to check in for the earliest pending appointment at that location on that day; admins can see those arrivals under Turnos activos. Location QR codes now contain a stable location ID; QR codes printed with a location name need to be reprinted if that location is renamed. After changing the Prisma schema, run `npm run db:init` from `backend/`, then restart the API with `npm run dev`.

Users have a `USER` or `ADMIN` role in SQLite. Public registration creates normal users. From **Administrar usuarios**, an administrator can create veterinarian accounts with the `ADMIN` role; the initial password is the veterinarian's full name. Veterinarians can change it from **Perfil → Cambiar contraseña** after signing in. To set up the first administrator, first register that account normally, then run this from `backend/`:

```bash
npm run admin:promote -- correo@ejemplo.com
```

Sign in after promotion so the app receives an administrator token. The token is verified against the current account password and role; it is not stored in a sessions table and does not expire after 30 days. Changing the account password invalidates existing tokens. Admin-only user deletion and appointment editing are checked by the backend. Deleting an account also deletes its pets and appointments, and the last administrator cannot be deleted.

When an administrator changes or cancels an appointment, the owner receives an in-app notification stored in SQLite. The app does not use remote push notifications or periodic requests. It synchronizes local reminders when the app is opened or returns to the foreground, and after the client books or cancels a turn. Changes made elsewhere while the app is closed are reflected the next time it synchronizes. Local reminders require notification permission and are not supported on the web target.

The app defaults to `http://localhost:3000` on web/iOS simulators and `http://10.0.2.2:3000` on Android emulators. For a physical phone, create `mobile/.env` and set `EXPO_PUBLIC_API_URL` to your computer's LAN IP. The phone and computer must be on the same network. Restart Expo after changing the variable.

Only submit the registration form when you are ready to create a real user. For this class exercise, passwords are stored and compared as plain text. This is not safe for a real or public app; use password hashing before production.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
