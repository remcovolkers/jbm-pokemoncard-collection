import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { buildTcgdexAssetUrl } from '../../core/domain/card-id.utils';

@Component({
  selector: 'pb-card-artwork',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="art-frame" [class.art-frame--compact]="compact()">
      @if (!failed() && activeUrl()) {
        <img
          [src]="activeUrl()"
          [alt]="alt()"
          loading="lazy"
          decoding="async"
          (error)="onImgError()"
        />
      } @else {
        <div class="art-fallback" [attr.aria-label]="alt()">
          <span class="material-symbols-outlined art-fallback__icon">style</span>
          @if (!compact()) {
            <span class="art-fallback__label">{{ fallbackLabel() }}</span>
          }
        </div>
      }
      <ng-content />
    </div>
  `,
  styles: [
    `
      @use 'tokens' as *;

      :host {
        display: block;
        width: 100%;
      }

      .art-frame {
        position: relative;
        width: 100%;
        aspect-ratio: 2.5 / 3.5;
        border-radius: $radius-sm;
        overflow: hidden;
        background: linear-gradient(155deg, $color-surface-highest 0%, $color-surface-lowest 100%);
        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.55);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      }

      .art-fallback {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.5rem;
        text-align: center;
        color: $color-on-surface-muted;
        background: radial-gradient(circle at 50% 35%, rgba($color-primary-container, 0.14), transparent 70%),
          $color-surface-lowest;

        &__icon {
          font-size: 24px;
          opacity: 0.7;
        }

        &__label {
          font-family: $font-mono;
          font-size: 0.625rem;
          line-height: 1.25;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    `,
  ],
})
export class CardArtworkComponent {
  readonly cardId = input<string>('');
  readonly src = input<string | undefined>(undefined);
  readonly alt = input<string>('Pokémon kaart');
  readonly compact = input<boolean>(false);

  private readonly fallbackStep = signal<0 | 1 | 2>(0);

  readonly activeUrl = computed(() => {
    const step = this.fallbackStep();
    const explicit = (this.src() ?? '').trim();
    const id = (this.cardId() ?? '').trim();

    if (step === 0) {
      return explicit || buildTcgdexAssetUrl(id, 'high');
    }
    if (step === 1) {
      if (explicit.includes('/high.webp')) {
        return explicit.replace('/high.webp', '/low.webp');
      }
      if (explicit.includes('/low.webp')) {
        return explicit.replace('/low.webp', '/high.png');
      }
      return buildTcgdexAssetUrl(id, 'low');
    }
    return '';
  });

  readonly failed = computed(() => this.fallbackStep() >= 2);
  readonly fallbackLabel = computed(() => this.cardId() || this.alt());

  onImgError(): void {
    this.fallbackStep.update((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : 2));
  }
}
