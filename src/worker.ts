/// <reference lib="webworker" />

import { decompressFromUrl } from 'compress-to-url';

async function fetchAsset(path: string, modifyUrls: boolean = false): Promise<Response> {
  const assetUrl = `https://compress-to-url.dobuki.net/example/${path}`;
  const response = await fetch(assetUrl);

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
      content = content.replace(/https:\/\/compress-to-url\.dobuki\.net/g, 'https://webpage-onthefly.dobuki.net')
        .replace(/src="dist\/index\.js"/, 'src="/dist/index.js"')
        .replace(/href="styles\.css"/, 'href="/styles.css"');
    }
  }

  return new Response(content, { headers: { 'Content-Type': mimeType } });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const encodedHtml = url.searchParams.get('u');

    if (encodedHtml) {
      try {
        const { data } = await decompressFromUrl(encodedHtml);
        return new Response(data as string, { headers: { 'Content-Type': 'text/html' } });
      } catch (err: any) {
        return new Response(`Error: ${err.message}`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
      }
    }

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
