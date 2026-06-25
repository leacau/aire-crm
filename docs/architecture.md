# Arquitectura objetivo de Aire CRM

## Decisión

Aire CRM será una plataforma compuesta por tres aplicaciones: una API modular,
la aplicación web y una aplicación Android nativa. La lógica de negocio y las
autorizaciones vivirán en la API; web y Android serán clientes de los mismos
casos de uso.

```text
Web (Next.js) ---------+
                      +---- API modular ---- Firebase / Google / Tango
Android (Kotlin) -----+
```

La transición será incremental. La web actual seguirá operativa mientras cada
dominio se extrae detrás de una frontera modular y luego detrás de la API.

## Principios obligatorios

1. Una sola fuente de verdad para reglas de negocio y permisos: el backend.
2. Los módulos se comunican mediante contratos públicos, nunca mediante sus
   archivos internos.
3. Toda operación se modela como un caso de uso; la interfaz no escribe datos
   directamente.
4. Los contratos HTTP son versionados y documentados con OpenAPI.
5. Cada dato operativo pertenece a una organización mediante `organizationId`.
6. Ocultar una opción en la interfaz no reemplaza la autorización en servidor.
7. Cada migración conserva compatibilidad hasta que todos los consumidores usan
   la nueva frontera.

## Estructura durante la transición

```text
src/
  app/                     rutas y composición de la web
  core/
    modules/               catálogo, activación y dependencias
  modules/
    prospects/
      domain/              entidades y reglas puras
      application/         casos de uso y puertos
      infrastructure/      adaptadores Firebase/API temporales
      index.ts             API pública de dominio
      client.ts            API pública para la web
      server.ts            API pública para rutas del backend
  components/              componentes heredados aún no migrados
  lib/                     servicios heredados aún no migrados
```

Estructura final prevista:

```text
apps/
  web/                     Next.js
  api/                     backend TypeScript modular
  android/                 Kotlin + Jetpack Compose
packages/
  contracts/               OpenAPI y artefactos generados
  web-ui/                  sistema visual web
infra/                     Firebase, despliegues y observabilidad
```

## Contrato de un módulo

Cada módulo declara:

- Identificador y versión.
- Plataformas soportadas.
- Dependencias con otros módulos.
- Capacidades (`prospects.read`, `prospects.approve`, etc.).
- Tipos de dominio y reglas puras.
- Puertos de aplicación.
- Adaptadores de infraestructura.
- Entradas públicas explícitas para dominio, cliente web y servidor.
- Pruebas unitarias, de integración y de contrato.

Cuando un módulo necesita una consulta de soporte de otro dominio, debe usar una
entrada pública pequeña y documentada. No debe importar infraestructura interna
de otro módulo ni arrastrar un barril de servidor completo si sólo necesita una
consulta acotada.

El catálogo se encuentra en `src/core/modules`. Todos los módulos actuales están
habilitados por defecto para preservar el funcionamiento existente. Una
configuración inválida, por ejemplo habilitar Oportunidades sin Clientes, se
rechaza explícitamente.

El endpoint `GET /api/v1/bootstrap?platform=android` entrega al cliente el usuario,
la organización, los módulos habilitados y sus capacidades concedidas. De este
modo Android no necesita replicar roles ni configuración en el binario.

## Seguridad y datos

Firebase Authentication continuará siendo el proveedor de identidad. Web y
Android enviarán el ID token a la API. La API verificará el token, resolverá la
organización, rol y capacidades del usuario, y recién entonces ejecutará el caso
de uso.

Durante la migración, las reglas de Firestore siguen protegiendo los accesos
heredados. Cuando un módulo complete su migración, sus escrituras directas desde
la interfaz deben cerrarse y pasar por la API.

## Android

La aplicación será nativa, con Kotlin y Jetpack Compose. Su estructura reflejará
los módulos de negocio y contará con:

- Firebase Authentication.
- Cliente de API generado desde OpenAPI.
- Room para caché local.
- WorkManager para sincronización confiable.
- Firebase Cloud Messaging para notificaciones.
- Navegación y acciones derivadas de módulos y capacidades del usuario.

Paridad funcional no implica copiar la interfaz web: cada flujo se adaptará al
teléfono manteniendo las mismas reglas y resultados.
