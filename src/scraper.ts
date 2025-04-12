import { MetaFields } from './types';

export async function parseMetaFields(html: string): Promise<MetaFields> {
  const fields: MetaFields = { title: '', description: '', image_url: '', url: '' };
  const patterns = [
    { key: 'title', regex: [/<title>(.*?)<\/title>/i, /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i, /<meta[^>]*name="twitter:title"[^>]*content="([^"]*)"/i] },
    { key: 'description', regex: [/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/i, /<meta[^>]*name="twitter:description"[^>]*content="([^"]*)"/i, /<meta[^>]*name="description"[^>]*content="([^"]*)"/i] },
    { key: 'image_url', regex: [/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i, /<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i] },
    { key: 'url', regex: [/<meta[^>]*property="og:url"[^>]*content="([^"]*)"/i] },
  ];

  for (const { key, regex } of patterns) {
    for (const r of regex) {
      const match = html.match(r);
      if (match) {
        fields[key as keyof MetaFields] = match[1];
        break;
      }
    }
  }
  return fields;
}

export async function handleScrapeRequest(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get('url');
  try {
    console.log(`Scraping ${targetUrl || 'missing URL'}`);
    const response = targetUrl ? await fetch(targetUrl) : undefined;
    if (!response?.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch URL' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    const html = await response.text();
    const metadata = await parseMetaFields(html);
    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    console.error(`Scrape error: ${err.message}`);
    return new Response(JSON.stringify({ error: 'Scrape error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
