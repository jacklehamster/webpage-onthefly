import { decompressFromUrl } from 'compress-to-url';

export async function handleDecompression(payload: string, requestUrl: URL): Promise<Response> {
  try {
    const { data } = await decompressFromUrl(payload);
    let html = data as string;

    // Ensure HTML has a body tag
    if (!html.includes('</body>')) {
      if (!html.includes('<body>')) {
        html = `<!DOCTYPE html><html><body>${html}</body></html>`;
      } else {
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
