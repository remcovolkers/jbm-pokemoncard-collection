import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { formatEur } from '../../core/domain/card-math.utils';
import {
  OFFICIAL_POKEMON_CARD_BACK_URL,
  ShowcaseCardViewModel,
} from '../../core/domain/card-showcase.utils';
import { HapticsService } from '../../core/platform/haptics.service';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CardArtworkComponent } from '../card-artwork/card-artwork.component';
import { PbBinderSwipeDirective } from '../directives/binder-swipe.directive';

@Component({
  selector: 'pb-card-showcase',
  standalone: true,
  imports: [CardArtworkComponent, PbBinderSwipeDirective],
  templateUrl: './card-showcase.component.html',
  styleUrl: './card-showcase.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardShowcaseComponent implements OnDestroy {
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly haptics = inject(HapticsService);

  readonly open = input.required<boolean>();
  readonly item = input<ShowcaseCardViewModel | null>(null);
  readonly currentIndex = input<number>(0);
  readonly totalCount = input<number>(1);
  readonly canPrev = input<boolean>(false);
  readonly canNext = input<boolean>(false);
  readonly primaryActionLabel = input<string>('');
  readonly primaryActionIcon = input<string>('add_circle');
  readonly secondaryActionLabel = input<string>('');
  readonly secondaryActionIcon = input<string>('edit');

  readonly closed = output<void>();
  readonly prev = output<void>();
  readonly next = output<void>();
  readonly primaryAction = output<void>();
  readonly secondaryAction = output<void>();

  readonly formatEur = formatEur;
  readonly Math = Math;
  readonly officialCardBackUrl = OFFICIAL_POKEMON_CARD_BACK_URL;

  readonly rotY = signal<number>(0);
  readonly rotX = signal<number>(0);
  readonly isDragging = signal<boolean>(false);
  readonly autoSpin = signal<boolean>(false);
  readonly cardBackFailed = signal<boolean>(false);

  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartRotY = 0;
  private dragStartRotX = 0;
  private rafId: number | null = null;
  private lastFrameTs = 0;
  private lastItemKey = '';

  constructor() {
    this.scrollLock.bind(
      () => this.open() && Boolean(this.item()),
      () => this.close()
    );

    effect(() => {
      const isOpen = this.open();
      const currentKey = this.item()?.key ?? '';

      if (!isOpen) {
        this.stopAutoSpinLoop();
        this.autoSpin.set(false);
        this.isDragging.set(false);
        this.rotX.set(0);
        this.rotY.set(0);
        this.lastItemKey = '';
        return;
      }

      if (currentKey && currentKey !== this.lastItemKey) {
        this.lastItemKey = currentKey;
        this.isDragging.set(false);
        this.rotX.set(0);
        this.rotY.set(0);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopAutoSpinLoop();
  }

  readonly isGradedSlab = computed(() => {
    const g = (this.item()?.grading ?? '').trim();
    return Boolean(g && g !== 'Raw');
  });

  readonly isShowingBack = computed(() => {
    const norm = ((this.rotY() % 360) + 360) % 360;
    return norm > 90 && norm < 270;
  });

  readonly isRotated = computed(
    () => Math.abs(this.rotX()) > 0.5 || Math.abs(this.rotY() % 360) > 0.5
  );

  readonly cardTransform = computed(
    () => `rotateX(${this.rotX().toFixed(2)}deg) rotateY(${this.rotY().toFixed(2)}deg)`
  );

  readonly glareX = computed(() => {
    const normY = Math.sin((this.rotY() * Math.PI) / 180);
    return Math.round(50 + normY * 42);
  });

  readonly glareY = computed(() => {
    const normX = Math.max(-1, Math.min(1, this.rotX() / 28));
    return Math.round(50 - normX * 38);
  });

  readonly holoShift = computed(() => {
    const norm = (((this.rotY() % 360) + 360) % 360) / 360;
    return Math.round(norm * 100);
  });

  readonly holoOpacity = computed(() => {
    const tiltEnergy =
      Math.min(1, Math.abs(Math.sin((this.rotY() * Math.PI) / 180)) * 0.85 + Math.abs(this.rotX()) / 32);
    return Number((0.24 + tiltEnergy * 0.52).toFixed(2));
  });

  readonly budgetDiff = computed(() => {
    const vm = this.item();
    if (!vm || vm.targetBudget === undefined) return 0;
    return vm.targetBudget - vm.marketPrice;
  });

  readonly isWithinBudget = computed(() => {
    const vm = this.item();
    if (!vm || vm.targetBudget === undefined || vm.targetBudget <= 0) return false;
    return vm.marketPrice <= vm.targetBudget;
  });

  onStagePointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (this.autoSpin()) {
      this.autoSpin.set(false);
      this.stopAutoSpinLoop();
    }

    this.activePointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartRotY = this.rotY();
    this.dragStartRotX = this.rotX();
    this.isDragging.set(true);

    const target = event.currentTarget as HTMLElement | null;
    try {
      target?.setPointerCapture?.(event.pointerId);
    } catch {
      // Veilige fallback voor synthetische events in tests
    }
  }

  onStagePointerMove(event: PointerEvent): void {
    if (this.isDragging() && (this.activePointerId === null || event.pointerId === this.activePointerId)) {
      const dx = event.clientX - this.dragStartX;
      const dy = event.clientY - this.dragStartY;
      const nextY = this.dragStartRotY + dx * 0.65;
      const nextX = Math.max(-28, Math.min(28, this.dragStartRotX - dy * 0.35));
      this.rotY.set(nextY);
      this.rotX.set(nextX);
      return;
    }

    // Subtiele muis-hover holo-tilt op desktop wanneer er niet gesleept of automatisch gedraaid wordt
    if (event.pointerType === 'mouse' && !this.autoSpin()) {
      const stage = event.currentTarget as HTMLElement | null;
      const rect = stage?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const relX = (event.clientX - rect.left) / rect.width - 0.5;
      const relY = (event.clientY - rect.top) / rect.height - 0.5;
      const baseFaceY = Math.round(this.rotY() / 180) * 180;
      this.rotY.set(baseFaceY + relX * 26);
      this.rotX.set(-relY * 22);
    }
  }

  onStagePointerUp(event: PointerEvent): void {
    if (!this.isDragging()) return;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;

    const target = event.currentTarget as HTMLElement | null;
    try {
      target?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Negeer
    }
    this.activePointerId = null;
    this.isDragging.set(false);
  }

  onStageMouseLeave(): void {
    if (this.isDragging() || this.autoSpin()) return;
    const baseFaceY = Math.round(this.rotY() / 180) * 180;
    this.rotY.set(baseFaceY);
    this.rotX.set(0);
  }

  flipCard(): void {
    void this.haptics.light();
    if (this.autoSpin()) {
      this.autoSpin.set(false);
      this.stopAutoSpinLoop();
    }
    const snappedHalfTurns = Math.round(this.rotY() / 180);
    this.rotY.set((snappedHalfTurns + 1) * 180);
    this.rotX.set(0);
  }

  toggleAutoSpin(): void {
    void this.haptics.light();
    const next = !this.autoSpin();
    this.autoSpin.set(next);
    if (next) {
      if (this.prefersReducedMotion()) {
        // Respecteer OS toegankelijkheidsinstelling: kantel subtiel naar een mooie showcase-hoek zonder continue rotatie
        this.rotY.set(18);
        this.rotX.set(6);
        return;
      }
      this.startAutoSpinLoop();
    } else {
      this.stopAutoSpinLoop();
    }
  }

  resetAngle(): void {
    void this.haptics.light();
    this.autoSpin.set(false);
    this.stopAutoSpinLoop();
    this.isDragging.set(false);
    this.rotX.set(0);
    this.rotY.set(0);
  }

  close(): void {
    this.stopAutoSpinLoop();
    this.autoSpin.set(false);
    this.closed.emit();
  }

  triggerPrev(): void {
    if (!this.canPrev()) return;
    void this.haptics.light();
    this.prev.emit();
  }

  triggerNext(): void {
    if (!this.canNext()) return;
    void this.haptics.light();
    this.next.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.open() || !this.item()) return;
    if (isEditableEventTarget(event.target)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
      return;
    }

    if (event.key === 'ArrowLeft') {
      if (this.canPrev()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.triggerPrev();
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      if (this.canNext()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.triggerNext();
      }
      return;
    }

    if (event.key === ' ' || event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      this.flipCard();
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      this.toggleAutoSpin();
      return;
    }

    if (event.key === '0') {
      event.preventDefault();
      this.resetAngle();
    }
  }

  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private startAutoSpinLoop(): void {
    this.stopAutoSpinLoop();
    if (typeof requestAnimationFrame === 'undefined') return;
    this.lastFrameTs = 0;

    const tick = (ts: number) => {
      if (!this.autoSpin() || !this.open()) {
        this.rafId = null;
        return;
      }
      const dt = this.lastFrameTs > 0 ? Math.min(64, ts - this.lastFrameTs) : 16;
      this.lastFrameTs = ts;
      this.rotY.update((y) => y + (dt / 1000) * 34);
      this.rotX.set(Math.sin(ts / 950) * 6.5);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopAutoSpinLoop(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.lastFrameTs = 0;
  }
}
