/// <reference lib="webworker" />

import { decompressFromUrl } from 'compress-to-url';

const CACHE_NAME = 'compress-to-url-cache';
const ASSETS_TTL = 60 * 60 * 24; // 24 hours
const VERSION = "1.0.1";

async function fetchAsset(path: string): Promise<Response> {
  const assetUrl = `https://compress-to-url.dobuki.net/example/${path}?v=${VERSION}`;
  const cacheKey = new Request(assetUrl).url;
  const cache = await caches.open(CACHE_NAME);

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
    content = content
      .replace(/src="dist\/index\.js"/, 'src="/dist/index.js"')
      .replace(/href="styles\.css"/, 'href="/styles.css"');
  }

  const headers = new Headers({
    'Content-Type': mimeType,
    'Cache-Control': `max-age=${ASSETS_TTL}`,
    'Access-Control-Allow-Origin': '*',
  });

  const newResponse = new Response(content, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  cache.put(cacheKey, newResponse.clone());
  return newResponse;
}

async function handleDecompression(payload: string, requestUrl: URL): Promise<Response> {
  try {
    const { data } = await decompressFromUrl(payload);
    let html = data as string;

    // Ensure HTML has a body tag
    if (!html.includes('</body>')) {
      if (!html.includes('<body>')) {
        // Wrap content in html/body tags if missing
        html = `<!DOCTYPE html><html><body>${html}</body></html>`;
      } else {
        // Add closing body tag
        html = html.replace('</html>', '</body></html>');
      }
    }

    // Create edit URL with ?u=...&edit=1
    const editUrl = new URL(requestUrl);
    editUrl.searchParams.set('u', payload);
    editUrl.searchParams.set('edit', '1');

    // Inject note in bottom right corner
    const noteHtml = `
      <div style="position: fixed; bottom: 10px; right: 10px; background: rgba(0, 0, 0, 0.7); color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; z-index: 1000;">
        Produced using <a href="${editUrl.toString()}" style="color: #3498db; text-decoration: none;" onmouseover="this.style.textDecoration='underline';" onmouseout="this.style.textDecoration='none';">onthefly.dobuki.net</a>
      </div>
    `;
    html = html.replace('</body>', `${noteHtml}</body>`);

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error(`Decompression error: ${err.message}`);
    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
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
    const encodedHtml = url.searchParams.get('u');
    const edit = url.searchParams.get('edit');
    if (encodedHtml && !edit) {
      return handleDecompression(encodedHtml, url);
    }

    // Serve static assets
    if (pathname === '/dist/index.js') {
      return fetchAsset('dist/index.js');
    } else if (pathname === '/styles.css') {
      return fetchAsset('styles.css');
    } else if (pathname === '/' || pathname === '/index.html') {
      return fetchAsset('index.html');
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
