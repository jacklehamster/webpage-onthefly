/// <reference lib="webworker" />

import { decompressFromUrl } from 'compress-to-url';

// Cache instance (uses Cloudflare's global cache)
const CACHE_NAME = 'webpage-onthefly-cache';
const ASSETS_TTL = 60 * 60 * 24; // 24 hours in seconds

async function fetchAsset(path: string, modifyUrls: boolean = false): Promise<Response> {
  const assetUrl = `https://compress-to-url.dobuki.net/example/${path}`;
  const cacheKey = new Request(assetUrl).url; // Unique key for cache
  const cache = await caches.open("onthefly");

  // Try to get from cache
  let response = await cache.match(cacheKey);
  if (response) {
    console.log(`Cache hit for ${path}`);
    return response.clone(); // Clone to avoid consuming the cached response
  }

  // Fetch from origin if not in cache
  console.log(`Cache miss for ${path}, fetching from origin`);
  response = await fetch(assetUrl);

  if (!response.ok) {
    return new Response('Asset not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Modify content if needed
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

  // Create a new Response with the modified content
  const newResponse = new Response(content, {
    status: response.status,
    statusText: response.statusText,
    headers: { 'Content-Type': mimeType },
  });

  // Cache the response
  const cacheResponse = newResponse.clone();
  cache.put(cacheKey, cacheResponse.clone().then(res => {
    // Add Cache-Control header for TTL
    res.headers.set('Cache-Control', `max-age=${ASSETS_TTL}`);
    return res;
  }));

  return newResponse;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const encodedHtml = url.searchParams.get('u');

    if (encodedHtml) {
      try {
        const { data } = await decompressFromUrl(encodedHtml);
        return new Response(data as string, {
          headers: { 'Content-Type': 'text/html' },
        });
      } catch (err) {
        return new Response(`Error: ${err.message}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }

    if (pathname === '/dist/index.js') {
      return fetchAsset('dist/index.js');
    } else if (pathname === '/styles.css') {
      return fetchAsset('styles.css');
    } else if (pathname === '/' || pathname === '/index.html') {
      return fetchAsset('index.html', true);
    }

    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};
