# Aire CRM

CRM modular para la operación comercial y administrativa de Aire de Santa Fe.

El proyecto está migrando gradualmente desde una aplicación Next.js conectada
directamente a Firebase hacia una plataforma con backend modular compartido por
la web y una futura aplicación Android nativa.

## Desarrollo local

```bash
npm install
npm run dev
```

Controles disponibles:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Arquitectura

- [Arquitectura objetivo](docs/architecture.md)
- [Hoja de migración](docs/migration-roadmap.md)
- [Contrato OpenAPI v1](docs/openapi-v1.yaml)
- [Descripción funcional original](docs/blueprint.md)

Los módulos nuevos deben publicar su contrato mediante entradas explícitas como
`src/modules/<modulo>/index.ts`, `client.ts`, `server.ts` o una entrada pública
especializada. Ningún consumidor debe importar archivos internos de otro módulo.
