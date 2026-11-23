import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalScrollLockService {
  private readonly doc = inject(DOCUMENT);
  private activeLocks = 0;

  readonly isLocked = signal(false);

  lock(): () => void {
    if (this.activeLocks === 0) {
      const scrollbarWidth =
        typeof window !== 'undefined'
          ? Math.max(0, window.innerWidth - this.doc.documentElement.clientWidth)
          : 0;
      if (scrollbarWidth > 0) {
        this.doc.documentElement.style.setProperty('--pb-scrollbar-comp', `${scrollbarWidth}px`);
      }
      this.doc.documentElement.classList.add('pb-modal-open');
      this.doc.body.classList.add('pb-modal-open');
      this.isLocked.set(true);
    }

    this.activeLocks += 1;
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.releaseOne();
    };
  }

  bind(isOpen: () => boolean): void {
    effect((onCleanup) => {
      if (!isOpen()) return;
      const release = this.lock();
      onCleanup(release);
    });
  }

  private releaseOne(): void {
    this.activeLocks = Math.max(0, this.activeLocks - 1);
    if (this.activeLocks === 0) {
      this.doc.documentElement.classList.remove('pb-modal-open');
      this.doc.body.classList.remove('pb-modal-open');
      this.doc.documentElement.style.removeProperty('--pb-scrollbar-comp');
      this.isLocked.set(false);
    }
  }
}
