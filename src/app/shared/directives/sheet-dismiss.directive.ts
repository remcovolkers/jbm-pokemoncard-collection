import { Directive, ElementRef, OnDestroy, OnInit, inject, output } from '@angular/core';

/**
 * Maakt het mogelijk om mobiele bottom sheets (.pb-sheet) natief omlaag te slepen
 * vanaf het handvat of bovenaan de scrollcontainer (scrollTop === 0) om te sluiten.
 */
@Directive({
  selector: '[pbSheetDismiss]',
  standalone: true,
})
export class PbSheetDismissDirective implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly pbSheetDismiss = output<void>();

  private startY = 0;
  private startX = 0;
  private startTime = 0;
  private currentDy = 0;
  private tracking = false;
  private dragging = false;
  private startedOnHandle = false;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return;
    if (event.touches.length !== 1) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, a, [role="switch"]')) {
      return;
    }

    const touch = event.touches[0];
    this.startY = touch.clientY;
    this.startX = touch.clientX;
    this.startTime = Date.now();
    this.currentDy = 0;
    this.dragging = false;
    this.startedOnHandle = Boolean(
      target?.closest('.pb-sheet__handle, .pb-sheet__header')
    );
    this.tracking = this.startedOnHandle || this.host.nativeElement.scrollTop <= 1;
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.tracking || event.touches.length !== 1) return;

    const el = this.host.nativeElement;
    const touch = event.touches[0];
    const dy = touch.clientY - this.startY;
    const dx = touch.clientX - this.startX;

    if (!this.dragging) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        this.tracking = false;
        return;
      }
      if (dy <= 0) {
        if (!this.startedOnHandle) {
          this.tracking = false;
        }
        return;
      }
      if (dy > 8 && (this.startedOnHandle || el.scrollTop <= 0)) {
        this.dragging = true;
      } else {
        return;
      }
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const clampedDy = Math.max(0, dy);
    this.currentDy = clampedDy;
    el.style.transition = 'none';
    el.style.transform = `translate3d(0, ${clampedDy}px, 0)`;

    const backdrop = el.closest('.pb-sheet-backdrop') as HTMLElement | null;
    if (backdrop) {
      backdrop.style.transition = 'none';
      backdrop.style.opacity = String(Math.max(0.25, 1 - clampedDy / 420));
    }
  };

  private readonly onTouchEnd = (): void => {
    if (!this.tracking) return;
    this.tracking = false;

    const el = this.host.nativeElement;
    const backdrop = el.closest('.pb-sheet-backdrop') as HTMLElement | null;

    if (!this.dragging) {
      this.currentDy = 0;
      return;
    }

    const elapsed = Math.max(1, Date.now() - this.startTime);
    const velocity = this.currentDy / elapsed;
    const shouldDismiss = this.currentDy >= 90 || (this.currentDy >= 36 && velocity >= 0.45);

    this.dragging = false;

    if (shouldDismiss) {
      el.style.transition = 'transform 150ms ease-out';
      el.style.transform = 'translate3d(0, 100%, 0)';
      if (backdrop) {
        backdrop.style.transition = 'opacity 150ms ease-out';
        backdrop.style.opacity = '0';
      }
      if (this.dismissTimer) clearTimeout(this.dismissTimer);
      this.dismissTimer = setTimeout(() => {
        this.resetInlineStyles();
        this.pbSheetDismiss.emit();
      }, 140);
      return;
    }

    el.style.transition = 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = '';
    if (backdrop) {
      backdrop.style.transition = 'opacity 160ms ease';
      backdrop.style.opacity = '';
    }
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => {
      this.resetInlineStyles();
    }, 170);
    this.currentDy = 0;
  };

  ngOnInit(): void {
    const el = this.host.nativeElement;
    el.addEventListener('touchstart', this.onTouchStart, { passive: true });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchEnd);
    this.resetInlineStyles();
  }

  private resetInlineStyles(): void {
    const el = this.host.nativeElement;
    el.style.transition = '';
    el.style.transform = '';
    const backdrop = el.closest('.pb-sheet-backdrop') as HTMLElement | null;
    if (backdrop) {
      backdrop.style.transition = '';
      backdrop.style.opacity = '';
    }
  }
}
