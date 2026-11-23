import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalScrollLockService {
  private readonly doc = inject(DOCUMENT);
  private activeLocks = 0;
  private nextDismissId = 1;
  private readonly dismissStack: Array<{ id: number; dismiss: () => void }> = [];

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

  bind(isOpen: () => boolean, onDismiss?: () => void): void {
    effect((onCleanup) => {
      if (!isOpen()) return;
      const releaseLock = this.lock();
      const unregisterDismiss = onDismiss ? this.pushDismissHandler(onDismiss) : undefined;
      onCleanup(() => {
        unregisterDismiss?.();
        releaseLock();
      });
    });
  }

  registerDismissHandler(isOpen: () => boolean, onDismiss: () => void): void {
    effect((onCleanup) => {
      if (!isOpen()) return;
      const unregister = this.pushDismissHandler(onDismiss);
      onCleanup(unregister);
    });
  }

  hasOpenOverlay(): boolean {
    return this.dismissStack.length > 0;
  }

  dismissTopOverlay(): boolean {
    const top = this.dismissStack[this.dismissStack.length - 1];
    if (!top) return false;
    top.dismiss();
    return true;
  }

  private pushDismissHandler(dismiss: () => void): () => void {
    const id = this.nextDismissId++;
    this.dismissStack.push({ id, dismiss });
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const idx = this.dismissStack.findIndex((entry) => entry.id === id);
      if (idx !== -1) {
        this.dismissStack.splice(idx, 1);
      }
    };
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
