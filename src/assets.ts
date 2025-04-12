const CACHE_NAME = 'compress-to-url-cache';
const ASSETS_TTL = 60 * 60 * 24; // 24 hours
const VERSION = "1.1.4";

async function clearCache(path: string) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(`https://compress-to-url.dobuki.net/example/${path}?v=${VERSION}`).url;
  await cache.delete(cacheKey);
  console.log(`Cleared cache for ${path}`);
}

export async function fetchAsset(path: string, isEditMode: boolean): Promise<Response> {
  const assetUrl = `https://compress-to-url.dobuki.net/example/${path}?v=${VERSION}`;
  const cacheKey = new Request(assetUrl).url;
  const cache = await caches.open(CACHE_NAME);

  // Check cache
  let response = await cache.match(cacheKey);
  if (response && !isEditMode) {
    console.log(`Cache hit for ${path}`);
    return response.clone();
  }

  console.log(`Cache miss for ${path}, fetching from origin`);
  if (path === 'index.html') {
    await clearCache(path); // Clear cache on version bump
  }

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
    console.log('Injecting SCRAPER_URL for edit mode');
    content = content.replace('</head>', `<script type='text/javascript'>window.SCRAPER_URL = '/scrape';</script></head>`);
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

  // Cache only non-edit mode responses
  if (!isEditMode) {
    cache.put(cacheKey, newResponse.clone());
  }
  return newResponse;
}
