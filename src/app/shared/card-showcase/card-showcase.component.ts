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
import {
  OFFICIAL_POKEMON_CARD_BACK_URL,
  ShowcaseCardViewModel,
} from '../../core/domain/card-showcase.utils';
import { HapticsService } from '../../core/platform/haptics.service';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { ModalScrollLockService } from '../../core/platform/modal-scroll-lock.service';
import { CardArtworkComponent } from '../card-artwork/card-artwork.component';

@Component({
  selector: 'pb-card-showcase',
  standalone: true,
  imports: [CardArtworkComponent],
  templateUrl: './card-showcase.component.html',
  styleUrl: './card-showcase.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardShowcaseComponent implements OnDestroy {
  private readonly scrollLock = inject(ModalScrollLockService);
  private readonly haptics = inject(HapticsService);

  readonly open = input.required<boolean>();
  readonly item = input<ShowcaseCardViewModel | null>(null);

  readonly closed = output<void>();

  readonly officialCardBackUrl = OFFICIAL_POKEMON_CARD_BACK_URL;

  readonly rotY = signal<number>(0);
  readonly rotX = signal<number>(0);
  readonly isDragging = signal<boolean>(false);
  readonly cardBackFailed = signal<boolean>(false);
  readonly isUnsheathing = signal<boolean>(false);

  private activePointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartRotY = 0;
  private dragStartRotX = 0;
  private lastItemKey = '';
  private unsheatheTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scrollLock.bind(
      () => this.open() && Boolean(this.item()),
      () => this.close()
    );

    effect(() => {
      const isOpen = this.open();
      const currentKey = this.item()?.key ?? '';

      if (!isOpen) {
        this.clearUnsheatheTimer();
        this.isUnsheathing.set(false);
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
        this.triggerKatanaReveal();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearUnsheatheTimer();
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
    return Math.round(50 + normY * 44);
  });

  readonly glareY = computed(() => {
    const normX = Math.max(-1, Math.min(1, this.rotX() / 28));
    return Math.round(50 - normX * 40);
  });

  readonly holoShift = computed(() => {
    const norm = (((this.rotY() % 360) + 360) % 360) / 360;
    return Math.round(norm * 100);
  });

  readonly holoOpacity = computed(() => {
    const tiltEnergy = Math.min(
      1,
      Math.abs(Math.sin((this.rotY() * Math.PI) / 180)) * 0.85 + Math.abs(this.rotX()) / 30
    );
    return Number((0.26 + tiltEnergy * 0.54).toFixed(2));
  });

  /**
   * Muis-klik + drag op desktop werkt exact hetzelfde als duim-drag op mobiel:
   * klik/houd vast op de kaart, sleep om vrij 360° te draaien en kantelen, laat los om op die hoek te laten staan.
   */
  onStagePointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();

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
      // Veilige fallback voor synthetische test-events
    }
  }

  onStagePointerMove(event: PointerEvent): void {
    if (!this.isDragging()) return;
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;

    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    const nextY = this.dragStartRotY + dx * 0.65;
    const nextX = Math.max(-30, Math.min(30, this.dragStartRotX - dy * 0.36));
    this.rotY.set(nextY);
    this.rotX.set(nextX);
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

  flipCard(): void {
    void this.haptics.light();
    const snappedHalfTurns = Math.round(this.rotY() / 180);
    this.rotY.set((snappedHalfTurns + 1) * 180);
    this.rotX.set(0);
  }

  resetAngle(): void {
    void this.haptics.light();
    this.isDragging.set(false);
    this.rotX.set(0);
    this.rotY.set(0);
  }

  close(): void {
    this.clearUnsheatheTimer();
    this.isUnsheathing.set(false);
    this.isDragging.set(false);
    this.closed.emit();
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

    if (event.key === ' ' || event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      this.flipCard();
      return;
    }

    if (event.key === '0') {
      event.preventDefault();
      this.resetAngle();
    }
  }

  private triggerKatanaReveal(): void {
    this.clearUnsheatheTimer();
    this.isUnsheathing.set(false);

    if (this.prefersReducedMotion()) {
      return;
    }

    // Start de eenmalige "samurai zwaard uit de schede" glans-reveal
    this.isUnsheathing.set(true);
    this.unsheatheTimer = setTimeout(() => {
      this.isUnsheathing.set(false);
      this.unsheatheTimer = null;
    }, 1050);
  }

  private clearUnsheatheTimer(): void {
    if (this.unsheatheTimer !== null) {
      clearTimeout(this.unsheatheTimer);
      this.unsheatheTimer = null;
    }
  }

  private prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }
}
