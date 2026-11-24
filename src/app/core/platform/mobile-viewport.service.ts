import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';

const MOBILE_BREAKPOINT_PX = 768;
const NON_KEYBOARD_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
]);

/**
 * Beheert de zichtbare mobiele viewport bij het virtuele toetsenbord:
 *  - Synchroniseert `--pb-viewport-height` met `window.visualViewport.height`
 *  - Zet `html.pb-keyboard-open` wanneer toetsenbord actief is (verbergt vaste onderste balken)
 *  - Scrolt gefocuste invoervelden (of `[data-keyboard-anchor]` containers zoals Alle Sets) netjes in beeld
 */
@Injectable({ providedIn: 'root' })
export class MobileViewportService implements OnDestroy {
  private readonly doc = inject(DOCUMENT);

  readonly viewportHeight = signal<number>(
    typeof window !== 'undefined' ? window.visualViewport?.height || window.innerHeight || 844 : 844
  );
  readonly isKeyboardOpen = signal<boolean>(false);

  private initialized = false;
  private baselineHeight = 0;
  private scrollTimers: Array<ReturnType<typeof setTimeout>> = [];
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onViewportResize = (): void => {
    this.syncViewportMetrics();
    const active = this.doc.activeElement as HTMLElement | null;
    if (active && this.isEditableElement(active) && this.isMobileViewport()) {
      this.ensureElementVisible(active);
    }
  };

  private readonly onFocusIn = (event: FocusEvent): void => {
    if (!this.isMobileViewport()) return;
    const target = event.target as HTMLElement | null;
    if (!target || !this.isEditableElement(target)) return;

    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }

    if (this.isTextKeyboardElement(target)) {
      this.setKeyboardOpen(true);
    }

    this.ensureElementVisible(target);
    this.clearScrollTimers();
    this.scrollTimers.push(
      setTimeout(() => this.ensureElementVisible(target), 180),
      setTimeout(() => this.ensureElementVisible(target), 340)
    );
  };

  private readonly onFocusOut = (): void => {
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.blurTimer = setTimeout(() => {
      const active = this.doc.activeElement as HTMLElement | null;
      if (active && this.isEditableElement(active)) return;
      this.syncViewportMetrics();
      if (!this.hasShrunkViewport()) {
        this.setKeyboardOpen(false);
      }
    }, 120);
  };

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    this.baselineHeight = window.innerHeight || window.visualViewport?.height || 0;
    this.syncViewportMetrics();

    window.visualViewport?.addEventListener('resize', this.onViewportResize);
    window.addEventListener('resize', this.onViewportResize);
    this.doc.addEventListener('focusin', this.onFocusIn);
    this.doc.addEventListener('focusout', this.onFocusOut);
  }

  ngOnDestroy(): void {
    this.clearScrollTimers();
    if (this.blurTimer) clearTimeout(this.blurTimer);
    if (typeof window !== 'undefined') {
      window.visualViewport?.removeEventListener('resize', this.onViewportResize);
      window.removeEventListener('resize', this.onViewportResize);
    }
    this.doc.removeEventListener('focusin', this.onFocusIn);
    this.doc.removeEventListener('focusout', this.onFocusOut);
  }

  ensureElementVisible(el: HTMLElement): void {
    if (!this.isMobileViewport()) return;

    const anchor = (el.closest('[data-keyboard-anchor]') as HTMLElement | null) ?? el;
    const scrollContainer =
      (el.closest('.pb-sheet') as HTMLElement | null) ??
      (el.closest('.shell__main') as HTMLElement | null);

    if (!scrollContainer) {
      anchor.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (anchor.getAttribute('data-keyboard-anchor') === 'top') {
      const stickyOffset = this.measureStickyHeaderOffset(scrollContainer);
      const desiredTop = containerRect.top + stickyOffset + 10;
      const delta = anchorRect.top - desiredTop;
      if (Math.abs(delta) > 4) {
        this.scrollContainerTo(scrollContainer, scrollContainer.scrollTop + delta);
      }
      return;
    }

    const stickyOffset = scrollContainer.classList.contains('pb-sheet')
      ? 12
      : this.measureStickyHeaderOffset(scrollContainer);
    const minTop = containerRect.top + stickyOffset + 16;
    const visibleHeight = this.viewportHeight();
    const dockHeight = scrollContainer.classList.contains('pb-sheet')
      ? 0
      : this.measureBottomDockOffset();
    const effectiveBottom = Math.min(containerRect.bottom, visibleHeight) - dockHeight - 18;

    if (elRect.bottom > effectiveBottom) {
      const delta = elRect.bottom - effectiveBottom;
      this.scrollContainerTo(scrollContainer, scrollContainer.scrollTop + delta);
    } else if (elRect.top < minTop) {
      const delta = elRect.top - minTop;
      this.scrollContainerTo(scrollContainer, scrollContainer.scrollTop + delta);
    }
  }

  private syncViewportMetrics(): void {
    if (typeof window === 'undefined') return;
    if (!this.isMobileViewport()) {
      this.doc.documentElement.style.removeProperty('--pb-viewport-height');
      this.setKeyboardOpen(false);
      return;
    }

    const currentHeight = Math.round(window.visualViewport?.height || window.innerHeight || 0);
    if (currentHeight > 0) {
      if (currentHeight > this.baselineHeight) {
        this.baselineHeight = currentHeight;
      }
      this.viewportHeight.set(currentHeight);
      this.doc.documentElement.style.setProperty('--pb-viewport-height', `${currentHeight}px`);
    }

    const active = this.doc.activeElement as HTMLElement | null;
    if (this.hasShrunkViewport() || (active && this.isTextKeyboardElement(active))) {
      this.setKeyboardOpen(true);
    } else {
      this.setKeyboardOpen(false);
    }
  }

  private hasShrunkViewport(): boolean {
    if (typeof window === 'undefined' || this.baselineHeight <= 0) return false;
    const current = window.visualViewport?.height || window.innerHeight || this.baselineHeight;
    return this.baselineHeight - current > 120;
  }

  private setKeyboardOpen(open: boolean): void {
    this.isKeyboardOpen.set(open);
    this.doc.documentElement.classList.toggle('pb-keyboard-open', open);
  }

  private isMobileViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
  }

  private isEditableElement(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !NON_KEYBOARD_INPUT_TYPES.has(type);
  }

  private isTextKeyboardElement(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !NON_KEYBOARD_INPUT_TYPES.has(type);
  }

  private measureStickyHeaderOffset(container: HTMLElement): number {
    const sticky = container.querySelector('.controls, .dex-controls, .more-tabs') as HTMLElement | null;
    return sticky ? Math.max(0, sticky.getBoundingClientRect().height) : 0;
  }

  private measureBottomDockOffset(): number {
    const dock = this.doc.querySelector('.qa-dock, .detail-dock') as HTMLElement | null;
    if (!dock) return 0;
    const style = typeof window !== 'undefined' ? window.getComputedStyle(dock) : null;
    if (style && style.display === 'none') return 0;
    return Math.max(0, dock.getBoundingClientRect().height);
  }

  private scrollContainerTo(container: HTMLElement, targetTop: number): void {
    const clampedTop = Math.max(0, targetTop);
    try {
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ top: clampedTop, behavior: 'smooth' });
      }
      container.scrollTop = clampedTop;
    } catch {
      container.scrollTop = clampedTop;
    }
  }

  private clearScrollTimers(): void {
    for (const timer of this.scrollTimers) {
      clearTimeout(timer);
    }
    this.scrollTimers = [];
  }
}
