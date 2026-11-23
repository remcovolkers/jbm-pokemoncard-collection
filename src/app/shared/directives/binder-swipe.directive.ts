import { Directive, ElementRef, OnDestroy, OnInit, inject, output } from '@angular/core';

/**
 * Horizontaal veeg-gebaar op mobiel voor de Pokédex Binder:
 * links vegen -> volgende pagina, rechts vegen -> vorige pagina.
 */
@Directive({
  selector: '[pbBinderSwipe]',
  standalone: true,
})
export class PbBinderSwipeDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly swipeNext = output<void>();
  readonly swipePrev = output<void>();

  private startX = 0;
  private startY = 0;
  private lastDx = 0;
  private tracking = false;
  private lockedHorizontal = false;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    if (event.touches.length !== 1) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, select, textarea')) return;

    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.lastDx = 0;
    this.tracking = true;
    this.lockedHorizontal = false;
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

    const damped = Math.max(-44, Math.min(44, dx * 0.22));
    const el = this.host.nativeElement;
    el.style.transition = 'none';
    el.style.transform = `translate3d(${damped}px, 0, 0)`;
  };

  private readonly onTouchEnd = (): void => {
    if (!this.tracking) return;
    this.tracking = false;

    const el = this.host.nativeElement;
    el.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = '';

    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      el.style.transition = '';
    }, 170);

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
