/// <reference lib="webworker" />

import { decompressFromUrl } from 'compress-to-url';

// Fetch and serve assets from compress-to-url.dobuki.net
async function fetchAsset(path: string, modifyUrls: boolean = false): Promise<Response> {
  const assetUrl = `https://compress-to-url.dobuki.net/example/${path}`;
  const response = await fetch(assetUrl);

  if (!response.ok) {
    return new Response('Asset not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let content = await response.text();
  let mimeType = 'text/plain';

  if (path.endsWith('.js')) {
    mimeType = 'application/javascript';
  } else if (path.endsWith('.css')) {
    mimeType = 'text/css';
  } else if (path.endsWith('.html')) {
    mimeType = 'text/html';
    if (modifyUrls) {
      // Replace URLs to point to the Worker domain
      content = content.replace(
        /https:\/\/compress-to-url\.dobuki\.net/g,
        'https://webpage-onthefly.dobuki.net'
      );
      // Update script and stylesheet paths
      content = content.replace(
        /src="dist\/index\.js"/,
        'src="/dist/index.js"'
      ).replace(
        /href="styles\.css"/,
        'href="/styles.css"'
      );
    }
  }

  return new Response(content, {
    headers: { 'Content-Type': mimeType },
  });
}

// Cloudflare Worker Handler
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const encodedHtml = url.searchParams.get('u');

    console.log(`Request URL: ${request.url}`); // Debug log
    console.log(`Pathname: ${pathname}, Encoded HTML: ${encodedHtml}`); // Debug log

    // Handle ?u=<payload> first to ensure it takes priority
    if (encodedHtml) {
      console.log(`Processing encoded HTML: ${encodedHtml}`); // Debug log
      try {
        const { data } = await decompressFromUrl(encodedHtml);
        const decodedHtml = data as string;
        return new Response(decodedHtml, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch (err: any) {
        console.error(`Error decompressing: ${err.message}`);
        return Response.redirect(`${url.protocol}//${url.host}/?error=${err.message} u=${encodedHtml.substring(0, 50)}${encodedHtml.length <= 50 ? "" : "..."}`);
      }
    }

    // Serve static assets
    if (pathname === '/dist/index.js') {
      return fetchAsset('dist/index.js');
    } else if (pathname === '/styles.css') {
      return fetchAsset('styles.css');
    } else if (pathname === '/' || pathname === '/index.html') {
      // Serve editor UI at root or /index.html
      return fetchAsset('index.html', true);
    }

    // Fallback for unmatched routes
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
