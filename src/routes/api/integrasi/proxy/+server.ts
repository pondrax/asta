import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const devUrl = env.ESIGN_DEV_URL || 'https://dev-esign.mojokertokota.go.id';
  return json({
    defaultDevUrl: devUrl.startsWith('http://') || devUrl.startsWith('https://')
      ? devUrl
      : `https://${devUrl}`,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let targetUrl = '';
    let method = 'GET';
    let authHeader = '';
    let forwardHeaders: Record<string, string> = {};
    let fetchBody: any = undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      targetUrl = (formData.get('__targetUrl') as string) || '';
      method = ((formData.get('__method') as string) || 'POST').toUpperCase();
      authHeader = (formData.get('__auth') as string) || '';

      const outgoingData = new FormData();
      for (const [key, val] of formData.entries()) {
        if (key.startsWith('__')) continue;
        outgoingData.append(key, val);
      }
      fetchBody = outgoingData;
    } else {
      const jsonBody = await request.json();
      targetUrl = jsonBody.__targetUrl || '';
      method = (jsonBody.__method || 'GET').toUpperCase();
      authHeader = jsonBody.__auth || '';
      const customHeaders = jsonBody.__headers || {};

      forwardHeaders = { ...customHeaders };
      if (jsonBody.__body !== undefined) {
        forwardHeaders['Content-Type'] = 'application/json';
        fetchBody = typeof jsonBody.__body === 'string' ? jsonBody.__body : JSON.stringify(jsonBody.__body);
      }
    }

    if (!targetUrl) {
      return json({ error: 'Target URL is required' }, { status: 400 });
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const headers: Record<string, string> = { ...forwardHeaders };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(targetUrl, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : fetchBody,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const resContentType = res.headers.get('content-type') || '';
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    if (resContentType.includes('application/pdf')) {
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return json({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        isBinary: true,
        contentType: resContentType,
        data: `data:${resContentType};base64,${base64}`,
      });
    }

    if (resContentType.includes('application/json')) {
      const data = await res.json().catch(() => null);
      return json({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        data,
      });
    }

    const text = await res.text();
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(text);
    } catch {}

    return json({
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      data: parsedJson ?? text,
    });
  } catch (err: any) {
    return json(
      {
        error: err?.message || 'Proxy request failed',
        status: 500,
      },
      { status: 500 }
    );
  }
};
