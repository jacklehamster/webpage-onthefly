/// <reference lib="webworker" />

import { handleScrapeRequest } from './scraper';
import { fetchAsset } from './assets';
import { handleDecompression } from './decompression';
import { hashString } from './utils';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/favicon.ico") {
      return Response.redirect("https://jacklehamster.github.io/webpage-onthefly/icon.png");
    }

    const encodedHtml = url.searchParams.get('u');
    const edit = url.searchParams.get('edit') === '1';

    if (encodedHtml && !edit) {
      const cache = await caches.open("onthefly-pages");
      const cacheKeyHash = await hashString(encodedHtml);
      const cacheKey = new Request(`${url.origin}/cache/${cacheKeyHash}`, request);

      let response = await cache.match(cacheKey);
      if (!response) {
        response = await handleDecompression(encodedHtml, url);
        response = new Response(response.body, response); // Clone with headers
        response.headers.set('Cache-Control', 'public, max-age=3600');
        await cache.put(cacheKey, response.clone());
      }
      return response;
    }

    // Handle scraper requests
    if (pathname === '/scrape') {
      return handleScrapeRequest(url);
    }

    // Handle POST requests to /decompress
    if (request.method === 'POST' && pathname === '/decompress') {
      try {
        const body = await request.json();
        const payload = body.payload;
        if (!payload || typeof payload !== 'string') {
          return new Response('Invalid payload: must be a string', {
            status: 400,
            headers: {
              'Content-Type': 'text/plain',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
        return handleDecompression(payload, url);
      } catch (err: any) {
        console.error(`Request parsing error: ${err.message}`);
        return new Response(`Error parsing request: ${err.message}`, {
          status: 400,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    // Handle GET requests with ?u=
    if (encodedHtml && !edit) {
      return handleDecompression(encodedHtml, url);
    }

    // Serve static assets
    if (pathname === '/dist/index.js') {
      return fetchAsset('dist/index.js', edit, url.origin);
    } else if (pathname === '/styles.css') {
      return fetchAsset('styles.css', edit, url.origin);
    } else if (pathname === '/' || pathname === '/index.html') {
      return fetchAsset('index.html', edit, url.origin);
    }

    return new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
