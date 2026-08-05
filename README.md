# CRM Multimedio

Un sistema integral de gestión de relaciones con clientes (CRM) diseñado
específicamente para el sector de medios, publicidad y gestión comercial. La
plataforma centraliza la administración del ciclo de ventas, el seguimiento de
prospectos, la carga de pautas publicitarias y la evaluación del rendimiento del
equipo mediante módulos de coaching corporativo.

## 🚀 Características Principales

### 1. Gestión Comercial y CRM

- **Clientes y Prospectos:** Gestión unificada de perfiles, historial de
  interacciones y seguimiento de cuentas.
- **Pipeline de Ventas (Kanban):** Interfaz visual para administrar
  oportunidades de negocio, permitiendo avanzar cada trato a través de sus
  etapas.
- **Actividades y Tareas:** Calendario integrado con Google Calendar y sistema
  de recordatorios automatizados.

### 2. Módulo de Medios y Publicidad

- **Órdenes de Publicidad (Pautas):** Formularios avanzados para la creación,
  aprobación y seguimiento de pautas publicitarias.
- **PNTs y Grillas de Programación:** Gestión de Publicidad No Tradicional (PNT)
  asociada a grillas diarias y semanales de programas.
- **Canjes y Convenios:** Control estructurado de intercambios comerciales y
  convenios con clientes.
- **Redes y Notas Web:** Administración de solicitudes de publicación en redes
  sociales y portales web.

### 3. Facturación e Integración ERP

- **Solicitudes de Facturación:** Flujo de aprobación para solicitudes de
  facturación de pautas.
- **Integración con Tango Gestión:** Mapeo de clientes, sincronización de
  comprobantes y resúmenes de cuenta directamente desde el sistema Tango.
- **Control de Cobranzas:** Seguimiento de pagos y estado de cuenta corriente.

### 4. Liderazgo, Coaching y Equipo

- **Sesiones de Coaching:** Herramienta dedicada para líderes y mentores,
  permitiendo registrar sesiones individuales, establecer objetivos y dar
  seguimiento al crecimiento de cada asesor.
- **Rendimiento (Performance):** Paneles de métricas (Dashboards) y reportes de
  conversión.
- **Gestión de Licencias y Vacaciones:** Flujo de aprobación para el ausentismo
  del personal.

### 5. Aplicación Móvil Nativa

- App complementaria para asesores comerciales en movimiento.
- Acceso a oportunidades, clientes, agenda de tareas y notificaciones en tiempo
  real.

---

## 🛠 Stack Tecnológico

**Frontend (Web):**

- [Next.js](https://nextjs.org/) (App Router)
- [React](https://reactjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- UI Components basados en [Radix UI] / [shadcn/ui]

**Backend y Base de Datos:**

- Next.js API Routes (Serverless)
- [Firebase](https://firebase.google.com/) (Firestore, Authentication, Cloud
  Messaging)
- Google Cloud Platform

**Mobile App:**

- [React Native](https://reactnative.dev/)
- [Expo](https://expo.dev/)

**Integraciones:**

- Google APIs (Calendar, Drive, Gmail)
- Tango Gestión (Sincronización de facturación y clientes)

---

## 📁 Estructura del Proyecto

El repositorio está dividido en dos aplicaciones principales: la plataforma
web/API y la aplicación móvil.

```text
crm-multimedio/
├── docs/                   # Documentación técnica y diagramas
├── mobile/                 # Aplicación móvil (Expo / React Native)
│   ├── src/screens/        # Pantallas de la app (Home, Clients, Opportunities, etc.)
│   ├── src/lib/            # Configuración de Firebase y API local
│   └── app.json            # Configuración de Expo
├── public/                 # Assets estáticos de la web
├── src/
│   ├── app/                # Next.js App Router (Páginas y Rutas API)
│   │   ├── api/            # Endpoints REST (tango, clientes, pautas, coaching, etc.)
│   │   └── (rutas)/        # Páginas web (dashboard, pipeline, canjes, facturación)
│   ├── components/         # Componentes React reutilizables
│   │   ├── ui/             # Componentes base (Botones, Inputs, Modales)
│   │   ├── billing/        # Componentes de facturación e integración Tango
│   │   ├── opportunities/  # Componentes del pipeline (Tablero Kanban)
│   │   └── team/           # Componentes de coaching y rendimiento
│   ├── lib/                # Lógica de negocio, utilidades y servicios backend
│   │   ├── server/         # Controladores de base de datos y lógica segura
│   │   └── api/            # Funciones fetcher para el cliente frontend
└── (Archivos de config)    # tailwind.config.ts, next.config.ts, firebase.json, etc.
```

---

## ⚙️ Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- [Node.js](https://nodejs.org/) (v18 o superior)
- [npm](https://www.npmjs.com/) o [Yarn](https://yarnpkg.com/)
- Una cuenta de Firebase con Firestore y Authentication habilitados.
- Credenciales de Google Cloud Platform (Client ID y Secret para integraciones).

---

## 🚀 Instalación y Uso (Entorno de Desarrollo)

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd crm-multimedio
```

### 2. Configuración de la Plataforma Web

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# (Completar las variables con las credenciales de Firebase, Google y configuración local)

# Iniciar el servidor de desarrollo
npm run dev
```

La aplicación web estará disponible en `http://localhost:3000`.

### 3. Configuración de la Aplicación Móvil

```bash
cd mobile

# Instalar dependencias del entorno móvil
npm install

# Configurar variables de entorno móviles
cp .env.example .env

# Iniciar Expo
npx expo start
```

Escanea el código QR generado en la terminal con la aplicación **Expo Go** en tu
dispositivo físico, o presiona `a` para abrir en un emulador de Android / `i`
para iOS.

---

## 🧪 Pruebas (Testing)

El proyecto utiliza Vitest para las pruebas unitarias y de integración de la
lógica de negocio.

```bash
npm run test
```

Las pruebas cubren utilidades críticas como el cálculo de facturación, acceso a
datos de Tango y reglas de negocio del CRM (`src/lib/__tests__/`).

---

## 📦 Despliegue (Deployment)

- **Web y API:** El proyecto está optimizado para ser desplegado en
  [Vercel](https://vercel.com/) (configuración en `vercel.json`) o mediante
  Firebase App Hosting (`apphosting.yaml`).
- **Reglas de Base de Datos:** Recuerda desplegar las reglas de seguridad de
  Firestore utilizando la CLI de Firebase:
  ```bash
  firebase deploy --only firestore:rules
  ```
- **Móvil:** Utiliza [EAS Build](https://expo.dev/eas) (Expo Application
  Services) para generar los binarios de producción (`.apk` / `.aab` para
  Android, `.ipa` para iOS).

---

## 🛡 Seguridad y Permisos

El sistema cuenta con un modelo de roles avanzado (Asesores, Supervisores,
Administración, Gerencia). Las políticas de acceso están protegidas en dos
capas:

1. **Frontend:** Rutas protegidas mediante middleware de Next.js y componentes
   que evalúan los permisos del usuario activo.
2. **Backend/Database:** Reglas estrictas en `firestore.rules` que validan el
   token de autenticación y los atributos del usuario antes de permitir
   operaciones de lectura/escritura.

---

_CRM Multimedio - Desarrollado para escalar el rendimiento de equipos
comerciales de alto nivel._
