# Front Mobile CRM

## Decision tecnica

El front mobile se inicia con Expo + React Native + TypeScript dentro de
`mobile/`.

Motivos:

- El sistema web ya usa React/TypeScript y la API privada esta modelada para
  consumir Firebase ID tokens.
- Permite reutilizar criterios, tipos y contratos sin reescribir toda la logica
  en Dart.
- Es suficiente para iOS y Android con un unico proyecto.

## Arquitectura inicial

- `mobile/App.tsx`: raiz de la app.
- `mobile/src/auth`: Firebase Auth, Google Sign-In y validacion de sesion.
- `mobile/src/lib/api-client.ts`: cliente HTTP privado con
  `Authorization: Bearer <idToken>`.
- `mobile/src/screens`: pantallas mobile iniciales.
- `/api/mobile/bootstrap`: endpoint agregado para validar sesion y devolver
  datos iniciales mobile.
- `/api/mobile/tasks` y `/api/mobile/clients`: endpoints mobile cerrados sobre
  servicios server existentes.

## Auth

1. El usuario inicia sesion con Google o email/password externo.
2. Firebase Auth genera un ID token.
3. La app llama `GET /api/mobile/bootstrap`.
4. La API valida dominio/lista blanca/perfil y devuelve la sesion mas datos
   iniciales.
5. Todas las llamadas privadas usan el token Firebase como Bearer.

## Alcance del primer corte

- Login.
- Sesion validada.
- Tareas pendientes.
- Clientes visibles segun permisos.
- Bootstrap mobile con una sola llamada inicial.

## Pendiente

- Definir iconos/splash y bundle final.
- Configurar OAuth clients de Android/iOS.
- Agregar navegacion nativa cuando pasemos de 3 pantallas.
- Extraer tipos compartidos desde la app web o un paquete comun.
- Crear endpoints agregados `/api/mobile/*` si alguna pantalla requiere
  demasiadas llamadas.

