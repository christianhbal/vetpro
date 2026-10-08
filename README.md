1) npm init tanto en el backend como mobile

2)entrar a la carpeta de Backend:
paso 1)npm install prisma --save-dev
paso 2)crear un archivo .env en backend
        pegar lo siguiente:
        DATABASE_URL="file:./dev.db"
paso 3)npm run db:init
paso 4)npm run dev

3)entrar en la carpeta de Mobile:
paso 1)npm install expo
paso 2)npx expo start
