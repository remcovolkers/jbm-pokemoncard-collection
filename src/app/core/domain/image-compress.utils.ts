import { FeedbackScreenshotUpload } from './models';

const MAX_RAW_UPLOAD_BYTES = 1_400_000;

export function buildDriveViewUrl(fileId?: string, fallbackUrl?: string): string {
  const clean = (fileId || '').trim();
  if (clean) {
    return `https://drive.google.com/file/d/${encodeURIComponent(clean)}/view`;
  }
  return fallbackUrl || '';
}

/**
 * Verkleint en comprimeert een screenshot of afbeeldingsbestand in de browser
 * zodat deze licht en snel via Apps Script naar Google Drive opgeslagen kan worden.
 */
export async function compressScreenshotFile(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<FeedbackScreenshotUpload> {
  if (!file || (file.type && !file.type.startsWith('image/'))) {
    throw new Error('Kies een geldige afbeelding (PNG, JPG of WebP).');
  }

  const maxDimension = options.maxDimension ?? 1400;
  const quality = options.quality ?? 0.82;
  const originalDataUrl = await readFileAsDataUrl(file);

  const compressedDataUrl = await resizeWithCanvasIfSupported(
    originalDataUrl,
    file.type || 'image/png',
    maxDimension,
    quality
  );

  const [header = '', base64 = ''] = compressedDataUrl.split(',');
  const mimeMatch = header.match(/^data:([^;]+);base64$/i);
  const mimeType = mimeMatch?.[1]?.toLowerCase() || 'image/jpeg';
  const approxBytes = Math.floor((base64.length * 3) / 4);

  if (!base64 || approxBytes > MAX_RAW_UPLOAD_BYTES) {
    throw new Error('De screenshot is nog te groot (> 1,4 MB). Kies een kleinere afbeelding.');
  }

  return {
    base64,
    mimeType,
    fileName: file.name || 'screenshot.webp',
    dataUrl: compressedDataUrl,
    sizeKb: Math.max(1, Math.round(approxBytes / 1024)),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('Afbeelding lezen wordt niet ondersteund in deze browser.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kon de gekozen afbeelding niet inlezen.'));
    reader.readAsDataURL(file);
  });
}

async function resizeWithCanvasIfSupported(
  dataUrl: string,
  fallbackMime: string,
  maxDimension: number,
  quality: number
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl;
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    const img = await loadImage(dataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return dataUrl;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Probeer WebP (meest compact), val terug op JPEG als WebP niet wordt ondersteund
    const webpUrl = canvas.toDataURL('image/webp', quality);
    if (webpUrl.startsWith('data:image/webp')) {
      return webpUrl;
    }

    const outMime = fallbackMime === 'image/png' ? 'image/jpeg' : fallbackMime;
    const fallbackUrl = canvas.toDataURL(outMime, quality);
    return fallbackUrl.startsWith('data:image/') ? fallbackUrl : dataUrl;
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Afbeelding laden verlopen')), 1500);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Afbeelding laden mislukt'));
    };
    img.src = src;
  });
}
