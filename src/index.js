const ALLOWED_REPOS = ['tax-talaivaa', 'roth-talaivaa', 'civicdna', 'yuktiai'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const repoName = url.pathname.replace(/^\/+/, '').split('/')[0];

    // Block root or any repo not in ALLOWED_REPOS
    if (!repoName || !ALLOWED_REPOS.includes(repoName)) {
      return new Response('Not Found', { status: 404 });
    }

    // Ensure trailing slash on repo root so GitHub Pages doesn't 301-redirect to github.io
    if (url.pathname === `/${repoName}`) {
      return Response.redirect(`${url.origin}/${repoName}/${url.search}`, 301);
    }

    // Proxy directly to evolvedhow.github.io/<repo-name>/...
    const targetUrl = `https://evolvedhow.github.io${url.pathname}${url.search}`;
    const response = await fetch(new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    }));

    return new Response(response.body, response);
  }
};
