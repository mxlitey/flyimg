export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const workerUrl = env.WORKER_API_URL;

  if (!workerUrl) {
    return new Response(JSON.stringify({ error: '未配置WORKER_API_URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const targetUrl = `${workerUrl}${url.pathname.replace(/^\/api/, '')}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');

  const adminSecret = url.searchParams.get('token') || headers.get('X-Cron-Secret');
  if (adminSecret) {
    headers.set('X-Cron-Secret', adminSecret);
  }

  try {
    const init = {
      method: request.method,
      headers
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(targetUrl, init);

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.delete('cf-ray');
    responseHeaders.delete('cf-cache-status');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: '代理请求失败，请检查网络连接' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
