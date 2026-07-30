# Security Policy

## Alcance

Este repositorio contiene la aplicacion interna de Aire CRM. La rama activa de
desarrollo es `api`; los fixes de seguridad se aplican sobre esa rama y luego
se despliegan segun el flujo de release vigente.

## Reporte de vulnerabilidades

No publiques vulnerabilidades en issues publicos. Reportalas directamente al
equipo responsable del proyecto con:

- descripcion del problema;
- pasos para reproducirlo;
- impacto estimado;
- rutas, endpoints o pantallas afectadas;
- capturas o logs relevantes, evitando incluir secretos.

## Manejo de secretos

No deben commitearse tokens, claves de Firebase Admin, credenciales de Tango,
archivos `.env` reales ni `google-services.json` con datos productivos. Usar
variables de entorno del proveedor de deploy o archivos locales ignorados por
Git.

## Respuesta

Los reportes se priorizan segun impacto sobre autenticacion, permisos,
facturacion, datos comerciales o integraciones externas. Cuando corresponda,
se preparara un fix en la rama `api` y se validara con tests, typecheck y build
antes del despliegue.
