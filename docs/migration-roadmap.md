# Hoja de migración modular

## Etapa 0 — Línea base

- Instalar dependencias de forma reproducible.
- Mantener `typecheck`, pruebas, lint y build como controles obligatorios.
- Inventariar módulos, integraciones, roles y flujos críticos.
- Incorporar control de versiones antes de cambios de datos o despliegues.

## Etapa 1 — Fronteras modulares

- Crear el catálogo de módulos, plataformas, capacidades y dependencias.
- Extraer tipos de dominio desde `src/lib/types.ts`.
- Dar a cada módulo una API pública mediante entradas explícitas.
- Redirigir consumidores desde `firebase-service.ts` hacia esas APIs públicas.

Estado actual:

- Prospectos fue el módulo piloto y ya usa API v1 para sus operaciones centrales.
- Clientes/personas ya tiene lectura, alta y edición detrás de API v1.
- Oportunidades ya tiene consultas de lectura detrás de API v1.
- Actividades ya tiene lectura, alta y actualización detrás de API v1.
- Tareas ya tiene lectura, finalización y reprogramación detrás de API v1.
- Facturación/Tango ya tiene consultas de comprobantes, historial por cliente y
  resumen mensual detrás de API v1, consumidos por web y listos para Android.
- Control de facturación ya tiene lectura y transiciones de estado de pedidos
  detrás de API v1, con permisos y notificaciones resueltas en servidor.
- Se integraron cambios funcionales nacidos en `codex_branch` sin merge directo:
  Tango/facturación, reinformado de aprobaciones, ejecuciones publicitarias
  previas a aprobación para gestión ejecutiva y el nuevo centro de actividad
  comercial sobre Coaching.
- Las operaciones destructivas o con cascadas complejas quedan pendientes hasta rediseñar sus efectos laterales.

## Etapa 2 — API central

- Crear autenticación y autorización comunes para todos los endpoints.
- Definir `organizationId` y resolver la organización del usuario.
- Publicar OpenAPI v1 y respuestas de error estables.
- Implementar en servidor los casos de uso migrados.
- Sustituir adaptadores heredados de la web por adaptadores HTTP.
- Cerrar escrituras directas a Firestore para cada módulo migrado.
- Mantener entradas públicas mínimas entre módulos para evitar acoplamientos pesados durante el build productivo.

## Etapa 3 — Base Android

- Crear el proyecto Kotlin/Compose y su sistema visual.
- Integrar autenticación, API, almacenamiento local y notificaciones.
- Implementar los módulos migrados usando el mismo contrato OpenAPI v1.
- Validar paridad funcional y permisos entre web y Android.

## Etapa 4 — Migración por dominios

Orden recomendado:

1. Clientes y personas.
2. Oportunidades y tareas.
3. Publicidad, contenidos y aprobaciones.
4. Facturación y cobranzas.
5. Canjes y necesidades.
6. Programación y calendario.
7. RR. HH., reportes y administración.

Cada dominio completa el ciclo frontera → API → web → Android antes de retirar
su implementación heredada.

## Definición de terminado por módulo

Un módulo se considera migrado solamente cuando:

- No tiene escrituras directas a Firestore desde una interfaz.
- Sus permisos se validan en servidor.
- Su contrato OpenAPI está versionado.
- Web y Android cubren las acciones acordadas.
- Cuenta con pruebas unitarias, de integración y de contrato.
- Registra errores y operaciones críticas.
- Puede habilitarse o deshabilitarse sin romper sus dependencias.
