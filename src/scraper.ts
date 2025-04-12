import { MetaFields } from './types';

export async function parseMetaFields(html: string, baseUrl: string): Promise<MetaFields> {
  const fields: MetaFields = { title: '', description: '', image_url: '', url: '' };
  const patterns = [
    { key: 'title', regex: [/<title>(.*?)<\/title>/i, /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i, /<meta[^>]*name="twitter:title"[^>]*content="([^"]*)"/i] },
    { key: 'description', regex: [/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i, /<meta[^>]*name="twitter:description"[^>]*content="([^"]*)"/i, /<meta[^>]*name="description"[^>]*content="([^"]*)"/i] },
    { key: 'image_url', regex: [/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i, /<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i] },
    { key: 'url', regex: [/<meta[^>]*property="og:url"[^>]*content="([^"]*)"/i] },
  ];

  // Parse metadata
  for (const { key, regex } of patterns) {
    for (const r of regex) {
      const match = html.match(r);
      if (match) {
        fields[key as keyof MetaFields] = match[1];
        break;
      }
    }
  }

  // Fallback for image_url: parse <img> tags
  if (!fields.image_url) {
    const imgRegex = /<img[^>]+src=["'](.*?)["']/gi;
    let match;
    while ((match = imgRegex.exec(html))) {
      let src = match[1];
      // Resolve relative URLs
      try {
        src = new URL(src, baseUrl).href;
      } catch {
        continue; // Skip invalid URLs
      }
      // Prefer jpg/png/jpeg, skip likely icons
      if (src.match(/\.(jpg|png|jpeg)$/i) && !src.includes('logo') && !src.includes('icon')) {
        fields.image_url = src;
        break;
      }
    }
  }

  return fields;
}

async function fetchWithTimeout(url: string, timeoutMs: number = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'User-Agent': 'curl/8.1.2',
      'Accept': '*/*',
      'Connection': 'keep-alive',
    };
    console.log(`Sending headers to ${url}: ${JSON.stringify(headers)}`);
    return await fetch(url, {
      signal: controller.signal,
      headers,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('Timeout after 8s');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseStream(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('No response body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    console.log(`Read ${result.length} bytes from response`);
    return result;
  } catch (err: any) {
    console.error(`Stream error: ${err.message}, partial data: ${result.length} bytes`);
    console.log(result);
    if (result.length > 1000) {
      // Accept partial HTML if substantial
      return result;
    }
    throw err;
  } finally {
    reader.releaseLock();
  }
}

async function fetchWithRetry(url: string, retries: number = 2): Promise<Response> {
  const delays = [2000, 4000]; // Exponential backoff: 2s, 4s
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`Fetching ${url} (attempt ${attempt})`);
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.error(`Fetch failed for ${url}: Status ${response.status} ${response.statusText}`);
        const headers = Array.from(response.headers.entries());
        console.error(`Response headers: ${JSON.stringify(headers)}`);
        if ([403, 404, 410].includes(response.status)) {
          throw new Error(`Permanent error: HTTP ${response.status}`); // Skip retries
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      console.log(`Fetch succeeded for ${url}: Status ${response.status}`);
      return response;
    } catch (err: any) {
      console.error(`Fetch error for ${url} (attempt ${attempt}): ${err.message}`);
      if (attempt <= retries && !err.message.includes('Permanent error')) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

export async function handleScrapeRequest(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get('url');
  try {
    console.log(`Scraping ${targetUrl || 'missing URL'}`);
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    const response = await fetchWithRetry(targetUrl);
    const html = await readResponseStream(response);
    const metadata = await parseMetaFields(html, targetUrl);
    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error(`Scrape error for ${targetUrl || 'unknown'}: ${err.message}`);
    return new Response(JSON.stringify({ error: `Failed to scrape: ${err.message}` }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
