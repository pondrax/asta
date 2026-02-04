import { FileStorage } from '$lib/server/storage';
import { json } from '@sveltejs/kit';

const storage = new FileStorage;
export async function GET({ params }) {
  const buffer = await storage.read(params.uri);

  try {

    // Get your buffer from storage
    const storage = new FileStorage();
    const arrayBuffer = await storage.read(params.uri);

    // Determine content type (you might want to store this info when saving)
    const extension = params.uri.split('.').pop()?.toLowerCase();
    const contentType = getContentType(extension);

    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return json({ error: 'File not found' }, { status: 404 });
  }
}

function getContentType(extension?: string): string {
  const mimeTypes: Record<string, string> = {
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'zip': 'application/zip',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
  };

  return mimeTypes[extension || ''] || 'application/octet-stream';
}