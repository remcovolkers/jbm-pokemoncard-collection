import { Injectable } from '@angular/core';

const DETAIL_ROUTE_PREFIX = '/collectie/kaart/';

function cleanUrl(url: string): string {
  return (url || '').split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
}

function isDetailRoute(url: string): boolean {
  return cleanUrl(url).startsWith(DETAIL_ROUTE_PREFIX.replace(/\/$/, '') + '/');
}

/**
 * Onthoudt de scrollpositie van het overzicht (Collectie, Ruil & Verkoop, Dashboard, …) wanneer je
 * doorklikt naar Kaartdetail, en herstelt die bij terugkeren (Terug, verwijderen, opslaan).
 * Wisselen tussen hoofdtabbladen opent nog steeds bovenaan.
 */
@Injectable({ providedIn: 'root' })
export class ScrollRestoreService {
  private saved: { url: string; top: number } | null = null;

  /** Aanroepen bij het starten van een navigatie (nog vóór de nieuwe view rendert). */
  onNavigationStart(fromUrl: string, toUrl: string, currentScrollTop: number): void {
    if (isDetailRoute(toUrl) && !isDetailRoute(fromUrl)) {
      this.saved = { url: cleanUrl(fromUrl), top: Math.max(0, Math.round(currentScrollTop)) };
    }
  }

  /** Bepaalt de scrollpositie voor de view waar de navigatie op uitkomt. */
  resolveScrollTop(fromUrl: string, toUrl: string): number {
    if (isDetailRoute(toUrl)) return 0;

    const saved = this.saved;
    this.saved = null;
    if (saved && isDetailRoute(fromUrl) && cleanUrl(toUrl) === saved.url) {
      return saved.top;
    }
    return 0;
  }

  /** Zet de scrollpositie en probeert opnieuw tot de view hoog genoeg gerenderd is. */
  applyScrollTop(el: HTMLElement, top: number, maxFrames = 12): void {
    if (top <= 0) {
      el.scrollTop = 0;
      return;
    }
    let frames = 0;
    const tick = () => {
      el.scrollTop = top;
      const reachable = el.scrollHeight - el.clientHeight >= top;
      if ((reachable && Math.abs(el.scrollTop - top) <= 2) || ++frames >= maxFrames) return;
      requestAnimationFrame(tick);
    };
    tick();
  }
}
