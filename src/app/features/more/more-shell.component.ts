import { AfterViewInit, Component, ElementRef, OnDestroy, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
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
          <a routerLink="sets" [replaceUrl]="true" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">fact_check</span>
            <span>Set Voortgang</span>
            @if (store.activeSets().length > 0) {
              <span class="more-tab__badge mono">{{ store.activeSets().length }}</span>
            }
          </a>

          <a routerLink="verlanglijst" [replaceUrl]="true" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">star</span>
            <span>Verlanglijst</span>
            @if (store.portfolio().openWishlistCount > 0) {
              <span class="more-tab__badge more-tab__badge--coral mono">
                {{ store.portfolio().openWishlistCount }}
              </span>
            }
          </a>

          <a routerLink="ruil-verkoop" [replaceUrl]="true" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">swap_horiz</span>
            <span>Ruil &amp; Verkoop</span>
            @if (store.tradeBinderCards().length > 0) {
              <span class="more-tab__badge mono">{{ store.tradeBinderCards().length }}</span>
            }
          </a>

          <a routerLink="feedback" [replaceUrl]="true" routerLinkActive="is-active" class="more-tab">
            <span class="material-symbols-outlined">checklist</span>
            <span>Feedback Hub</span>
            @if (feedback.stats().active > 0) {
              <span class="more-tab__badge more-tab__badge--emerald mono">
                {{ feedback.stats().active }}
              </span>
            }
          </a>

          <a routerLink="instellingen" [replaceUrl]="true" routerLinkActive="is-active" class="more-tab">
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
        top: 0;
        z-index: $z-sticky;
        border-bottom: 1px solid rgba($color-outline-variant, 0.55);

        // Op desktop staan alle 5 Meer-tools al direct in de linker zijbalk
        @include mq-md {
          display: none;
        }

        &::before,
        &::after {
          content: '';
          position: absolute;
          top: 0;
          bottom: 1px;
          width: 22px;
          pointer-events: none;
          z-index: 2;
        }

        &::before {
          left: 0;
          background: linear-gradient(90deg, $color-surface-low 0%, transparent 100%);
        }

        &::after {
          right: 0;
          background: linear-gradient(270deg, $color-surface-low 0%, transparent 100%);
        }

        &__inner {
          @include hide-scrollbar;
          display: flex;
          align-items: center;
          gap: $space-sm;
          overflow-x: auto;
          padding: 0 $margin-mobile;
          scroll-behavior: smooth;

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
export class MoreShellComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(CollectionStore);
  readonly feedback = inject(FeedbackStore);
  private readonly router = inject(Router);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private navSub: Subscription | null = null;
  private centerTimer: ReturnType<typeof setTimeout> | null = null;

  ngAfterViewInit(): void {
    this.centerActiveTab();
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.centerTimer) clearTimeout(this.centerTimer);
        this.centerTimer = setTimeout(() => this.centerActiveTab(), 30);
      });
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
    if (this.centerTimer) clearTimeout(this.centerTimer);
  }

  private centerActiveTab(): void {
    const active = this.hostEl.nativeElement.querySelector('.more-tab.is-active') as HTMLElement | null;
    active?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
}
