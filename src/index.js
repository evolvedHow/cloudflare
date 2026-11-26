import routes from "../routes.json";

const MAIN_SITE = "https://www.claritypath.us";

// Hostname GitHub Pages treats as canonical for your org (see routes notes).
// If `curl -sI https://evolvedhow.github.io/<repo>/` returns 200 with no
// redirect, change this to "evolvedhow.github.io".
const ORIGIN_HOST = "app.claritypath.us";

// Longest matching prefix wins, so "/app/tax-talaivaa" beats "/app".
function findRoute(pathname) {
  return Object.entries(routes)
    .sort((a, b) => b[0].length - a[0].length)
    .find(
      ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/")
    );
}

// Turn a route into where to fetch from and how to map paths back.
// Returns null if the route can't be resolved.
function resolveProxyTarget(prefix, dest, pathname) {
  let publicPrefix = prefix; // what the visitor sees, e.g. "/app/kula"
  let originHost;
  let originBase; // path on the origin, e.g. "/kula" or ""
  let ownHosts; // hostnames that count as "the same site" in redirects

  if (dest.type === "github") {
    let repo = dest.repo;

    // No repo given: "/app" + "/kula/x" -> repo "kula"
    if (!repo) {
      const seg = pathname.slice(prefix.length).split("/")[1];
      if (!seg) return null;
      repo = seg;
      publicPrefix = `${prefix}/${seg}`;
    }

    originHost = dest.host || ORIGIN_HOST;
    originBase = `/${repo}`;
    ownHosts = new Set([originHost, `${dest.owner}.github.io`]);
  } else if (dest.type === "proxy") {
    const base = new URL(dest.url);
    originHost = base.host;
    originBase = base.pathname.replace(/\/$/, "");
    ownHosts = new Set([base.host]);
  } else {
    return null;
  }

  return { publicPrefix, originHost, originBase, ownHosts };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Safety net: if this Worker is ever bound to the origin host itself,
    // pass through instead of looping.
    if (url.hostname === ORIGIN_HOST) {
      return fetch(request);
    }

    // Main Google Site
    if (pathname === "/") {
      return Response.redirect(MAIN_SITE, 302);
    }

    const match = findRoute(pathname);
    if (!match) {
      return new Response("ClarityPath: Route not found", { status: 404 });
    }

    const [prefix, dest] = match;

    // Plain redirect (best choice for Google Sites)
    if (dest.type === "redirect") {
      let target = dest.url;
      if (dest.preservePath) {
        target = target.replace(/\/$/, "") + pathname.slice(prefix.length);
      }
      if (dest.preserveQuery) {
        target += url.search;
      }
      return Response.redirect(target, dest.status || 302);
    }

    // Reverse proxy (GitHub Pages or any normal website)
    const t = resolveProxyTarget(prefix, dest, pathname);
    if (!t) {
      return new Response("ClarityPath: Bad or unsupported route", {
        status: 404,
      });
    }

    const remaining = pathname.slice(t.publicPrefix.length);
    const targetUrl = new URL(`https://${t.originHost}`);
    targetUrl.pathname = `${t.originBase}${remaining}` || "/";
    targetUrl.search = url.search;

    const upstream = await fetch(new Request(targetUrl, request), {
      redirect: "manual",
    });

    // Rewrite redirects that point back at the same site
    const location = upstream.headers.get("Location");

    if (location && upstream.status >= 300 && upstream.status < 400) {
      const redirected = new URL(location, targetUrl);

      if (
        t.ownHosts.has(redirected.hostname) &&
        (t.originBase === "" ||
          redirected.pathname === t.originBase ||
          redirected.pathname.startsWith(t.originBase + "/"))
      ) {
        const publicPath =
          t.publicPrefix + redirected.pathname.slice(t.originBase.length);

        const headers = new Headers(upstream.headers);
        headers.set(
          "Location",
          publicPath + redirected.search + redirected.hash
        );

        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      }
    }

    return new Response(upstream.body, upstream);
  },
};
