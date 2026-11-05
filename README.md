# comexius-web

Sitio público de Comexius en https://comexius.com (Cloudflare Worker `comexius-web`).

- `site/`: las páginas (ES y EN), estilos, favicon, robots y sitemap.
- `src/worker.js`: sirve los archivos, redirige www → apex, cabeceras de seguridad y formulario de acceso a la beta (`POST /api/acceso`, mail con el binding `send_email`).
- `scripts/build.mjs`: empaqueta `site/` dentro del Worker (`dist/`).

## Publicar
Workers Builds conectado a este repositorio publica `main` solo:
- Build: `npm run build`
- Deploy: `npx wrangler deploy`

`EMAIL_TO` (casilla que recibe los pedidos de acceso) se configura en el panel del Worker, no en el repositorio.

## Reglas
- Anonimato mientras dure la beta: el sitio no nombra al fundador ni a su empleador.
- La landing promete solo la cobertura vigente del producto. Si la cobertura cambia, cambiar el sitio.
