# Aire CRM

Aplicacion interna de gestion comercial, facturacion, programacion y
seguimiento operativo de Aire.

La rama `api` concentra la migracion hacia una arquitectura con API propia y
frontends desacoplados para web y mobile.

## Comandos principales

```bash
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
```

## Mobile

El frontend mobile vive en `mobile/` y consume la misma API autenticada que el
frontend web. Las variables reales de entorno no deben commitearse.
