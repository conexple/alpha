// Hostname-gated apex redirect for conexple-worker-web.
//
// conexple.com / www.conexple.com → 301 → https://alpha.conexple.com${path}${search}
// alpha.conexple.com (and the workers.dev URL) → serve static assets from ./out
//
// Path + querystring are preserved through the redirect.
//
// Note: We intentionally avoid importing `@cloudflare/workers-types` here —
// apps/web is a Next.js workspace whose tsconfig targets the DOM lib, and
// pulling in Workers ambient types would conflict (Request, Response, etc.).
// Instead we declare a minimal local `Fetcher` shape that matches the
// ASSETS binding Wrangler injects at runtime.

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "conexple.com" || url.hostname === "www.conexple.com") {
      // Build the redirect manually (not Response.redirect()) so we can pin
      // explicit cache headers. Cloudflare's edge cache previously latched
      // onto a stale 200 HTML at the apex hostname (during the brief window
      // before this Worker was deployed) — we want every redirect response
      // to bypass cache going forward so a future change here propagates
      // immediately. `no-store` is stronger than `no-cache` and tells CF to
      // not persist the response in any cache tier.
      return new Response(null, {
        status: 301,
        headers: {
          Location: `https://alpha.conexple.com${url.pathname}${url.search}`,
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          "CDN-Cache-Control": "no-store",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
