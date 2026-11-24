export interface SheetTemplateConfig {
  spreadsheetId: string;
  copyUrl: string;
  previewUrl: string;
  githubCodeUrl: string;
  bundledCodePath: string;
}

export const SHEET_TEMPLATE_CONFIG: SheetTemplateConfig = {
  spreadsheetId: '1bZKzRHDNTaExkag2-5JSt8ncxrARfdojcjk2Stynmwg',
  copyUrl:
    'https://docs.google.com/spreadsheets/d/1bZKzRHDNTaExkag2-5JSt8ncxrARfdojcjk2Stynmwg/copy',
  previewUrl:
    'https://docs.google.com/spreadsheets/d/1bZKzRHDNTaExkag2-5JSt8ncxrARfdojcjk2Stynmwg/edit?gid=1001#gid=1001',
  githubCodeUrl:
    'https://github.com/remcovolkers/jbm-pokemoncard-collection/blob/main/apps-script/Code.gs',
  bundledCodePath: 'apps-script/Code.gs',
};

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Genereert een willekeurige alfanumerieke API-sleutel voor Google Apps Script Script Properties.
 */
export function generateSecureApiToken(length = 40): string {
  const size = Math.max(24, Math.floor(length));
  const bytes = new Uint8Array(size);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < size; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

/**
 * Kopieert tekst veilig naar het klembord (met textarea-fallback wanneer Clipboard API ontbreekt/blokkeert).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Val terug op verborgen textarea
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

/**
 * Haalt het Google Apps Script Deployment ID (bijv. AKfycb...) uit een `/macros/s/<ID>/exec` Web App URL.
 */
export function extractAppsScriptDeploymentId(webAppUrl: string | null | undefined): string | null {
  const clean = (webAppUrl || '').trim();
  if (!clean) return null;
  const match = clean.match(/\/macros\/s\/([^/?#]+)/i);
  return match?.[1] ? match[1].trim() : null;
}

/**
 * Verkort een lang Deployment ID leesbaar zodat begin én eind herkenbaar zijn in Google's Manage Deployments.
 */
export function formatDeploymentIdShort(deploymentId: string | null | undefined): string {
  const id = (deploymentId || '').trim();
  if (!id) return '';
  if (id.length <= 24) return id;
  return `${id.slice(0, 16)}…${id.slice(-6)}`;
}
