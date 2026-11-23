import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import {
  buildLimitlessAssetUrl,
  buildPokemonTcgAssetUrl,
  buildTcgdexAssetUrl,
} from '../../core/domain/card-id.utils';

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

  private readonly fallbackStep = linkedSignal<string, number>({
    source: () => `${this.cardId()}|${this.src() ?? ''}|${this.compact()}`,
    computation: () => 0,
  });

  readonly candidateUrls = computed<string[]>(() => {
    const urls: string[] = [];
    const pushUnique = (url: string) => {
      const clean = url.trim();
      if (clean && !urls.includes(clean)) {
        urls.push(clean);
      }
    };

    const explicit = (this.src() ?? '').trim();
    const id = (this.cardId() ?? '').trim();
    const preferredQuality: 'high' | 'low' = this.compact() ? 'low' : 'high';

    if (explicit) {
      pushUnique(explicit);
      if (explicit.includes('/high.webp')) {
        pushUnique(explicit.replace('/high.webp', '/low.webp'));
      } else if (explicit.includes('/low.webp')) {
        pushUnique(explicit.replace('/low.webp', '/high.png'));
      } else if (explicit.endsWith('_hires.png')) {
        pushUnique(explicit.replace(/_hires\.png$/, '.png'));
      } else if (explicit.endsWith('_LG.png')) {
        pushUnique(explicit.replace(/_LG\.png$/, '_SM.png'));
      }
    } else if (id) {
      pushUnique(buildTcgdexAssetUrl(id, 'high'));
      pushUnique(buildTcgdexAssetUrl(id, 'low'));
    }

    if (id) {
      pushUnique(buildTcgdexAssetUrl(id, preferredQuality));
      if (preferredQuality === 'high') {
        pushUnique(buildLimitlessAssetUrl(id, 'high'));
        pushUnique(buildLimitlessAssetUrl(id, 'low'));
        pushUnique(buildPokemonTcgAssetUrl(id, 'high'));
        pushUnique(buildPokemonTcgAssetUrl(id, 'low'));
      } else {
        pushUnique(buildLimitlessAssetUrl(id, 'low'));
        pushUnique(buildPokemonTcgAssetUrl(id, 'low'));
      }
    }

    return urls;
  });

  readonly activeUrl = computed(() => this.candidateUrls()[this.fallbackStep()] ?? '');
  readonly failed = computed(() => !this.activeUrl());
  readonly fallbackLabel = computed(() => this.cardId() || this.alt());

  onImgError(): void {
    const max = this.candidateUrls().length;
    this.fallbackStep.update((s) => (s < max ? s + 1 : max));
  }
}
