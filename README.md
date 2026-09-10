# App Congreso 2026 (React Native + Laravel API)

Aplicación móvil base con:

- Login con usuario y contraseña
- Token guardado localmente (AsyncStorage)
- Menú con dos opciones: Consultar y Seguimiento
- Cliente API con `axios` para Laravel (`/api/login`)

## 1) Ejecutar proyecto

```bash
npm install
npm run start
```

Luego abre en Android/iOS con Expo Go.

## 2) Configurar URL de la API Laravel

Edita `src/config/api.ts`:

- Emulador Android (Laravel en tu PC): `http://10.0.2.2:8000/api`
- Dispositivo físico: `http://TU_IP_LOCAL:8000/api`

## 3) Login esperado

La app envía `POST /api/login` con payload:

```json
{
  "usuario": "tu_usuario",
  "clave": "tu_clave"
}
```

La API debe retornar `token` o `access_token`.

## 4) Consultar lugar de votación

La opción **Consultar** usa el endpoint externo:

- `GET https://apiserver.convexosit.co/personas?id=<cedula>`
- Header requerido: `api_key`

Configura en `src/config/api.ts`:

- `PERSONAS_API_URL`
- `PERSONAS_API_KEY`

## 5) Nota sobre MySQL (root sin contraseña)

React Native no debe conectarse directamente a MySQL. La conexión a MySQL se configura en Laravel (`.env`), por ejemplo:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=tu_base
DB_USERNAME=root
DB_PASSWORD=
```

La app móvil solo consume endpoints HTTP del backend Laravel.
