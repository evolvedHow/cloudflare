
import routes from "../routes.json";

const MAIN_SITE = "https://www.claritypath.us";

function findRoute(pathname) {
  return Object.entries(routes)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([prefix]) =>
      pathname === prefix ||
      pathname.startsWith(prefix + "/")
    );
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Main Google Site
    if (pathname === "/") {
      return Response.redirect(MAIN_SITE, 302);
    }

    // Resolve public URL
    const match = findRoute(pathname);

    if (!match) {
      return new Response("ClarityPath: Route not found", {
        status: 404
      });
    }

    const [prefix, destination] = match;

    // GitHub Pages destination
    if (destination.type !== "github") {
      return new Response("Unsupported destination type", {
        status: 501
      });
    }

    // Build origin URL
    const remainingPath = pathname.slice(prefix.length);

    const githubBase =
      `https://${destination.owner}.github.io/${destination.repo}`;

    const targetUrl = new URL(githubBase);
    targetUrl.pathname =
      `/${destination.repo}${remainingPath}`;
    targetUrl.search = url.search;

    // Fetch origin
    const upstream = await fetch(
      new Request(targetUrl, request),
      { redirect: "manual" }
    );

    // Rewrite redirects pointing to the same GitHub Pages site
    const location = upstream.headers.get("Location");

    if (location && upstream.status >= 300 &&
        upstream.status < 400) {
      const redirected = new URL(location, targetUrl);

      const githubPrefix = `/${destination.repo}`;

      if (
        redirected.hostname ===
          `${destination.owner}.github.io` &&
        (
          redirected.pathname === githubPrefix ||
          redirected.pathname.startsWith(githubPrefix + "/")
        )
      ) {
        const publicPath =
          prefix + redirected.pathname.slice(githubPrefix.length);

        const headers = new Headers(upstream.headers);

        headers.set(
          "Location",
          publicPath + redirected.search + redirected.hash
        );

        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers
        });
      }
    }

    return new Response(upstream.body, upstream);
  }
};
