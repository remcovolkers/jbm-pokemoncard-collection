import { Directive, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';

/**
 * Horizontaal veeg-gebaar voor elke Vorige/Volgende-navigatie (o.a. Pokédex Binder,
 * Kaartdetail, High-res Lightbox en Alle Sets-paginering):
 * links vegen -> volgende, rechts vegen -> vorige.
 */
@Directive({
  selector: '[pbBinderSwipe], [pbSwipeNav]',
  standalone: true,
})
export class PbBinderSwipeDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly swipeEnabled = input<boolean>(true);
  readonly swipeCanNext = input<boolean>(true);
  readonly swipeCanPrev = input<boolean>(true);
  readonly swipeEdgeGuardPx = input<number>(24);

  readonly swipeNext = output<void>();
  readonly swipePrev = output<void>();

  private startX = 0;
  private startY = 0;
  private lastDx = 0;
  private tracking = false;
  private lockedHorizontal = false;
  private appliedTransform = false;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (!this.swipeEnabled() || event.touches.length !== 1) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (this.isInsideHorizontalScroller(target)) return;

    const touch = event.touches[0];
    const guard = Math.max(0, this.swipeEdgeGuardPx());
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    if (guard > 0 && vw > guard * 2 && (touch.clientX <= guard || touch.clientX >= vw - guard)) {
      return;
    }

    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.lastDx = 0;
    this.tracking = true;
    this.lockedHorizontal = false;
    this.appliedTransform = false;
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    this.lastDx = dx;

    if (!this.lockedHorizontal) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        this.tracking = false;
        return;
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        this.lockedHorizontal = true;
      } else {
        return;
      }
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    if (this.prefersReducedMotion()) return;

    const blocked = (dx < 0 && !this.swipeCanNext()) || (dx > 0 && !this.swipeCanPrev());
    const damped = blocked
      ? Math.max(-16, Math.min(16, dx * 0.08))
      : Math.max(-44, Math.min(44, dx * 0.22));
    const el = this.host.nativeElement;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${damped}px, 0, 0)`;
    this.appliedTransform = true;
  };

  private readonly onTouchEnd = (): void => {
    if (!this.tracking) return;
    this.tracking = false;

    const el = this.host.nativeElement;
    if (this.appliedTransform) {
      el.style.transition = this.prefersReducedMotion()
        ? ''
        : 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = '';

      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => {
        el.style.transition = '';
      }, 170);
      this.appliedTransform = false;
    }

    if (this.lockedHorizontal) {
      if (this.lastDx <= -56) {
        this.swipeNext.emit();
      } else if (this.lastDx >= 56) {
        this.swipePrev.emit();
      }
    }
    this.lockedHorizontal = false;
    this.lastDx = 0;
  };

  private isInsideHorizontalScroller(target: HTMLElement | null): boolean {
    if (!target || typeof window === 'undefined') return false;
    let node: HTMLElement | null = target;
    while (node && node !== this.host.nativeElement) {
      if (node.scrollWidth > node.clientWidth + 2) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  }

  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  ngOnInit(): void {
    const el = this.host.nativeElement;
    el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy(): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchEnd);
    el.style.transition = '';
    el.style.transform = '';
  }
}
