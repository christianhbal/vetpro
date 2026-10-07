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

After login, the app keeps the current user locally and uses its ID to create and list that user's pets. Pets created before the owner relationship have no user and do not appear in the list. A selected pet photo is stored as a Base64 data URL in SQLite.

The account phone number is required. An address is optional: it can be entered while registering or added later in Edit Profile. The profile screen displays the saved address, and profile updates are stored in the user's database record. The home screen shows a thumbnail of each pet's photo.

Appointments are stored in the `Turno` table and linked to both the signed-in user and one of that user's pets. The Turnos screen and home page show only saved upcoming appointments; past appointments appear in History. After changing the Prisma schema, run `npm run db:init` from `backend/`, then restart the API with `npm run dev`.

The app defaults to `http://localhost:3000` on web/iOS simulators and `http://10.0.2.2:3000` on Android emulators. For a physical phone, create `mobile/.env` from `mobile/.env.example` and set `EXPO_PUBLIC_API_URL` to your computer's LAN IP. The phone and computer must be on the same network. Restart Expo after changing the variable.

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
