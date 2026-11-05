// Comexius — sitio público (comexius.com)
// Sirve los archivos de /site, redirige www → apex y recibe el formulario de acceso a la beta.
// Los archivos vienen de dos fuentes posibles:
//   - empaquetados por scripts/build.mjs (globalThis.__ASSETS), que es lo que publica Workers Builds;
//   - o, mientras no haya repo conectado, del KV "comexius-web-site" (binding SITE), cargado por la API.
import { EmailMessage } from "cloudflare:email";

const CANONICAL = "comexius.com";
const PERFILES = { particular: "Particular", pyme: "Pyme / empresa", despachante: "Despachante de aduana", forwarder: "Forwarder / courier" };
const TYPES = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", png: "image/png", txt: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8" };

function securityHeaders(h) {
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  h.set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
  return h;
}

// Devuelve { body, ext } o null.
async function load(env, path) {
  const ext = path.split(".").pop();
  const bundled = globalThis.__ASSETS;
  if (bundled) {
    const a = bundled[path];
    if (!a) return null;
    return { body: a.b64 ? Uint8Array.from(atob(a.data), c => c.charCodeAt(0)) : a.data, ext };
  }
  if (env.SITE) {
    const v = await env.SITE.get(path, ext === "png" ? "arrayBuffer" : "text");
    return v == null ? null : { body: v, ext };
  }
  return null;
}

async function resolve(env, pathname) {
  // Sin barra final y sin extensión: /privacidad → /privacidad.html ; /en → redirige a /en/
  const candidates = [];
  if (pathname.endsWith("/")) candidates.push(pathname + "index.html");
  else { candidates.push(pathname); if (!/\.[a-z0-9]+$/i.test(pathname)) candidates.push(pathname + ".html"); }
  for (const p of candidates) { const a = await load(env, p); if (a) return { path: p, asset: a }; }
  if (!pathname.endsWith("/") && (await load(env, pathname + "/index.html"))) return { redirect: pathname + "/" };
  return null;
}

function respond(asset, status = 200, extra = {}) {
  const h = securityHeaders(new Headers({ "Content-Type": TYPES[asset.ext] || "application/octet-stream", "Cache-Control": asset.ext === "html" ? "public, max-age=300" : "public, max-age=86400", ...extra }));
  return new Response(asset.body, { status, headers: h });
}

function encHeader(s) { return "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(s))) + "?="; }

async function handleAcceso(request, env) {
  const form = await request.formData();
  const get = k => String(form.get(k) || "").trim();
  const lang = get("lang") === "en" ? "en" : "es";
  const thanks = lang === "en" ? "/en/thanks" : "/gracias";
  const back = lang === "en" ? "/en/#access" : "/#acceso";

  // Anti-spam: honeypot lleno o envío en menos de 3 segundos → se descarta en silencio.
  const t = Number(get("t"));
  if (get("web") || !t || Date.now() - t < 3000) return Response.redirect(new URL(thanks, request.url).toString(), 303);

  const nombre = get("nombre").slice(0, 120);
  const mail = get("mail").slice(0, 200);
  const perfil = PERFILES[get("perfil")] || "Sin indicar";
  const que = get("que").slice(0, 1000);
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return Response.redirect(new URL(back, request.url).toString(), 303);

  const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const text = [
    "Nuevo pedido de acceso a la beta de Comexius", "",
    `Nombre: ${nombre}`, `Mail: ${mail}`, `Perfil: ${perfil}`, `Idioma: ${lang}`,
    `Qué quiere importar/exportar: ${que || "(no indicó)"}`, "",
    `Fecha: ${fecha} (Buenos Aires)`, `País: ${request.cf?.country || "?"}`,
  ].join("\r\n");

  const sender = `hola@${CANONICAL}`;
  const to = env.EMAIL_TO;
  const raw = [
    `From: Comexius <${sender}>`, `To: ${to}`, `Reply-To: ${mail}`,
    `Subject: ${encHeader(`[Comexius] Acceso a la beta: ${nombre} (${perfil})`)}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${CANONICAL}>`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", text,
  ].join("\r\n");

  try {
    if (!env.EMAIL || !to) throw new Error("sin binding EMAIL o EMAIL_TO");
    await env.EMAIL.send(new EmailMessage(sender, to, raw));
  } catch (e) {
    // El usuario no debe ver un error; el pedido queda en el log del Worker.
    console.error("acceso: no se pudo mandar el mail: " + String(e));
    console.log("acceso:" + JSON.stringify({ nombre, mail, perfil, lang, que }));
  }
  return Response.redirect(new URL(thanks, request.url).toString(), 303);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www." + CANONICAL) {
      url.hostname = CANONICAL; url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/acceso") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      return handleAcceso(request, env);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    const r = await resolve(env, url.pathname);
    if (r?.redirect) { url.pathname = r.redirect; return Response.redirect(url.toString(), 301); }
    if (r?.asset) return respond(r.asset);

    const home = await load(env, url.pathname.startsWith("/en/") ? "/en/index.html" : "/index.html");
    return home ? respond(home, 404, { "Cache-Control": "no-store" }) : new Response("Not found", { status: 404 });
  },
};
