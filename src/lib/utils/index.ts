import { init } from '@paralleldrive/cuid2'
import type { Options } from 'qr-code-styling';
export function debounce(fn: (el: Event) => Promise<void>, delay: number) {
  let timeoutId: number | NodeJS.Timeout;
  return (el: Event) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(el), delay);
  };
}

export function formatFileSize(bytes: number) {
  const kb = bytes / 1024;
  const mb = kb / 1024;

  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  } else {
    return `${kb.toFixed(1)} KB`;
  }
}

export function createId(length = 15) {
  return init({ length })()
}



export function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(';base64,')[1]);
    reader.readAsDataURL(blob);
  });
}
export function fileToBase64(blob: Blob) {
  return new Promise<string>((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
export async function generateQRCode(options: Options, asBlob = false) {
  const QRCode = (await import('qr-code-styling')).default;
  const qrcode = new QRCode({
    ...options,
    type: 'canvas',
    width: 300,
    height: 300,
    // image:
    // 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII',
    // image: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg',
    image: options.image || '/favicon.png',

    // imageOptions: {
    // 	crossOrigin: 'anonymous',
    // 	margin: 0
    // },
    dotsOptions: {
      // color: '#ff6767',
      type: 'rounded'
    },
    cornersSquareOptions: {
      type: 'extra-rounded'
    }
  });
  // return await qrcode.download();
  const blob = (await qrcode.getRawData('png')) as Blob;
  if (asBlob) {
    return blob;
  }
  return blobToBase64(blob);
  // return (await qrcode.getRawData('png'))?.arrayBuffer() || '';
}