/// <reference lib="webworker" />

import { decompressFromUrl } from 'compress-to-url';

const CACHE_NAME = 'webpage-onthefly-cache';
const ASSETS_TTL = 60 * 60 * 24; // 24 hours

async function fetchAsset(path: string, modifyUrls: boolean = false): Promise<Response> {
  const assetUrl = `https://compress-to-url.dobuki.net/example/${path}`;
  const cacheKey = new Request(assetUrl).url;
  const cache = await caches.open("onthefly");

  let response = await cache.match(cacheKey);
  if (response) {
    console.log(`Cache hit for ${path}`);
    return response.clone();
  }

  console.log(`Cache miss for ${path}, fetching from origin`);
  response = await fetch(assetUrl);

  if (!response.ok) {
    return new Response('Asset not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
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
      content = content
        .replace(/https:\/\/compress-to-url\.dobuki\.net/g, 'https://webpage-onthefly.dobuki.net')
        .replace(/src="dist\/index\.js"/, 'src="/dist/index.js"')
        .replace(/href="styles\.css"/, 'href="/styles.css"');
    }
  }

  const newResponse = new Response(content, {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': mimeType },
  });

  cache.put(cacheKey, (() => {
    const res = newResponse.clone();
    res.headers.set('Cache-Control', `max-age=${ASSETS_TTL}`);
    return res;
  })());

  return newResponse;
}

async function handleDecompression(payload: string): Promise<Response> {
  try {
    const { data } = await decompressFromUrl(payload);
    return new Response(data as string, { headers: { 'Content-Type': 'text/html' } });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle POST requests to /decompress
    if (request.method === 'POST' && pathname === '/decompress') {
      try {
        const body = await request.json();
        const payload = body.payload;
        if (!payload || typeof payload !== 'string') {
          return new Response('Invalid payload: must be a string', {
            status: 400,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return handleDecompression(payload);
      } catch (err: any) {
        return new Response(`Error parsing request: ${err.message}`, {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    // Handle GET requests with ?u=
    const encodedHtml = url.searchParams.get('u');
    if (encodedHtml) {
      return handleDecompression(encodedHtml);
    }

    // Serve static assets
    if (pathname === '/dist/index.js') {
      return fetchAsset('dist/index.js');
    } else if (pathname === '/styles.css') {
      return fetchAsset('styles.css');
    } else if (pathname === '/' || pathname === '/index.html') {
      return fetchAsset('index.html', true);
    }

    return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  },
};
