import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CollectionStore } from '../../core/state/collection.store';
import { FeedbackStore } from '../../core/state/feedback.store';

@Component({
  selector: 'app-more-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="more-shell">
      <nav class="more-tabs" aria-label="Tools navigatie">
        <div class="more-tabs__inner">
          <a routerLink="sets" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">fact_check</span>
            <span>Set Voortgang</span>
            <span class="more-tab__badge mono">{{ store.setProgress().length }}</span>
          </a>

          <a routerLink="verlanglijst" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">star</span>
            <span>Verlanglijst</span>
            <span class="more-tab__badge more-tab__badge--coral mono">
              {{ store.portfolio().openWishlistCount }}
            </span>
          </a>

          <a routerLink="ruil-verkoop" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">swap_horiz</span>
            <span>Ruil &amp; Verkoop</span>
            <span class="more-tab__badge mono">{{ store.tradeBinderCards().length }}</span>
          </a>

          <a routerLink="feedback" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">checklist</span>
            <span>Feedback Hub</span>
            <span class="more-tab__badge more-tab__badge--emerald mono">
              {{ feedback.stats().active }}
            </span>
          </a>

          <a routerLink="instellingen" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">tune</span>
            <span>Instellingen</span>
          </a>
        </div>
      </nav>

      <div class="more-shell__body">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [
    `
      @use 'tokens' as *;
      @use 'mixins' as *;

      .more-shell {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .more-tabs {
        @include surface-glass;
        position: sticky;
        top: calc(#{$header-height} + env(safe-area-inset-top, 0px));
        z-index: $z-sticky;
        border-bottom: 1px solid rgba($color-outline-variant, 0.55);

        // Op desktop staan alle 5 Meer-tools al direct in de linker zijbalk
        @include mq-md {
          display: none;
        }

        &__inner {
          @include hide-scrollbar;
          display: flex;
          align-items: center;
          gap: $space-sm;
          overflow-x: auto;
          padding: 0 $margin-mobile;

          @include mq-md {
            padding: 0 $margin-desktop;
          }
        }
      }

      .more-tab {
        @include touch-target(46px);
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.75rem 0.5rem;
        color: $color-on-surface-muted;
        font-size: 0.85rem;
        font-weight: 500;
        white-space: nowrap;
        flex-shrink: 0;

        .material-symbols-outlined {
          font-size: 19px;
        }

        &:hover {
          color: $color-on-surface;
        }

        &.is-active {
          color: $color-primary-container;
          font-weight: 600;

          .material-symbols-outlined {
            font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
          }

          &::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 2.5px;
            border-radius: $radius-full;
            background-color: $color-primary-container;
          }
        }

        &__badge {
          padding: 0.1rem 0.42rem;
          border-radius: $radius-full;
          background-color: $color-surface-highest;
          color: $color-on-surface-variant;
          font-size: 0.65rem;
          font-weight: 700;

          &--coral {
            background-color: rgba($color-primary-container, 0.2);
            color: $color-primary;
          }

          &--emerald {
            background-color: rgba($color-secondary, 0.16);
            color: $color-secondary;
          }
        }
      }
    `,
  ],
})
export class MoreShellComponent {
  readonly store = inject(CollectionStore);
  readonly feedback = inject(FeedbackStore);
}
