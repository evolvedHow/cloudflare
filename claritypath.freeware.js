const ALLOWED_REPOS = ['tax-talaivaa'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const subPath = url.pathname.replace(/^\/freeware\/?/, '');
    const repoName = subPath.split('/')[0];

    // 1. Block any repo not explicitly on the ClarityPath freeware allowlist
    if (!ALLOWED_REPOS.includes(repoName)) {
      return new Response('Not Found', { status: 404 });
    }

    // 2. Ensure trailing slash on the repo root (e.g. /freeware/tax-talaivaa -> /freeware/tax-talaivaa/)
    //    so GitHub Pages doesn't 301-redirect the user to evolvedhow.github.io
    if (url.pathname === `/freeware/${repoName}`) {
      return Response.redirect(`${url.origin}/freeware/${repoName}/${url.search}`, 301);
    }

    // 3. Proxy cleanly to GitHub Pages
    const targetUrl = `https://evolvedhow.github.io/${subPath}${url.search}`;
    const response = await fetch(new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    }));

    return new Response(response.body, response);
  }
};