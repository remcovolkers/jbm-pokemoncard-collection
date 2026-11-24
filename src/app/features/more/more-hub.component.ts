import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatEur, formatPercent } from '../../core/domain/card-math.utils';
import { AppUpdateService } from '../../core/platform/app-update.service';
import { HapticsService } from '../../core/platform/haptics.service';
import { PlatformService } from '../../core/platform/platform.service';
import { CollectionStore } from '../../core/state/collection.store';
import { FeedbackStore } from '../../core/state/feedback.store';

@Component({
  selector: 'app-more-hub',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="hub-menu">
      <!-- Compacte Sync & Profiel Statuskaart -->
      <section class="pb-card status-card">
        <div class="status-card__left">
          <span
            class="pb-dot"
            [class.pb-dot--pulse]="store.syncStatus() === 'synced' || store.syncStatus() === 'syncing'"
            [class.pb-dot--secondary]="store.syncStatus() === 'synced'"
            [class.pb-dot--tertiary]="store.syncStatus() === 'demo' || store.syncStatus() === 'offline' || store.syncStatus() === 'unconfigured'"
            [class.pb-dot--primary]="store.syncStatus() === 'error'"
          ></span>
          <div class="status-card__copy">
            <strong>{{ syncHeadline() }}</strong>
            <span class="mono">{{ syncSubline() }}</span>
          </div>
        </div>

        <button
          type="button"
          class="pb-btn pb-btn--icon status-card__refresh"
          aria-label="Nu synchroniseren"
          [disabled]="store.isSyncing()"
          (click)="refreshSync()"
        >
          <span class="material-symbols-outlined" [class.pb-spin]="store.isSyncing()">sync</span>
        </button>
      </section>

      <!-- Gegroepeerde Tool-secties -->
      <div class="hub-menu__groups">
        <section class="hub-section">
          <h2 class="hub-section__title">Collectie &amp; Handel</h2>
          <div class="pb-card hub-list">
            <a routerLink="/meer/sets" class="hub-row" (click)="haptics.light()">
              <span class="hub-row__icon hub-row__icon--emerald">
                <span class="material-symbols-outlined">fact_check</span>
              </span>
              <span class="hub-row__copy">
                <strong>Set Voortgang</strong>
                <span class="mono">
                  {{ activeSetsCount() }} actieve sets · gem. {{ formatPercent(avgSetProgress(), false) }} compleet
                </span>
              </span>
              @if (activeSetsCount() > 0) {
                <span class="pb-pill pb-pill--neutral mono">{{ activeSetsCount() }}</span>
              }
              <span class="material-symbols-outlined hub-row__chev">chevron_right</span>
            </a>

            <a routerLink="/meer/verlanglijst" class="hub-row" (click)="haptics.light()">
              <span class="hub-row__icon hub-row__icon--coral">
                <span class="material-symbols-outlined">star</span>
              </span>
              <span class="hub-row__copy">
                <strong>Verlanglijst</strong>
                <span class="mono">
                  {{ openWishlistCount() }} open wensen · {{ formatEur(openWishlistBudget()) }} totaal
                </span>
              </span>
              @if (openWishlistCount() > 0) {
                <span class="pb-pill pb-pill--primary mono">{{ openWishlistCount() }}</span>
              }
              <span class="material-symbols-outlined hub-row__chev">chevron_right</span>
            </a>

            <a routerLink="/meer/ruil-verkoop" class="hub-row" (click)="haptics.light()">
              <span class="hub-row__icon hub-row__icon--amber">
                <span class="material-symbols-outlined">swap_horiz</span>
              </span>
              <span class="hub-row__copy">
                <strong>Ruil &amp; Verkoop</strong>
                <span class="mono">
                  {{ tradeCount() }} ruilkaarten · {{ formatEur(tradeValue()) }} waarde
                </span>
              </span>
              @if (tradeCount() > 0) {
                <span class="pb-pill pb-pill--neutral mono">{{ tradeCount() }}</span>
              }
              <span class="material-symbols-outlined hub-row__chev">chevron_right</span>
            </a>
          </div>
        </section>

        <section class="hub-section">
          <h2 class="hub-section__title">App &amp; Community</h2>
          <div class="pb-card hub-list">
            <a routerLink="/meer/feedback" class="hub-row" (click)="haptics.light()">
              <span class="hub-row__icon hub-row__icon--emerald">
                <span class="material-symbols-outlined">checklist</span>
              </span>
              <span class="hub-row__copy">
                <strong>Feedback Hub</strong>
                <span class="mono">
                  {{ feedback.stats().active }} open punten · stem of meld ideeën
                </span>
              </span>
              @if (feedback.stats().active > 0) {
                <span class="pb-pill pb-pill--secondary mono">{{ feedback.stats().active }}</span>
              }
              <span class="material-symbols-outlined hub-row__chev">chevron_right</span>
            </a>

            <a routerLink="/meer/instellingen" class="hub-row" (click)="haptics.light()">
              <span class="hub-row__icon hub-row__icon--slate">
                <span class="material-symbols-outlined">tune</span>
              </span>
              <span class="hub-row__copy">
                <strong>Instellingen &amp; Sync</strong>
                <span>Google Sheets, profielen &amp; app-updates</span>
              </span>
              @if (updates.apkUpdateAvailable() || updates.webUpdateAvailable()) {
                <span
                  class="pb-pill mono"
                  [class.pb-pill--tertiary]="updates.apkUpdateAvailable()"
                  [class.pb-pill--secondary]="!updates.apkUpdateAvailable() && updates.webUpdateAvailable()"
                >
                  Update
                </span>
              }
              <span class="material-symbols-outlined hub-row__chev">chevron_right</span>
            </a>
          </div>
        </section>
      </div>

      <!-- Snelle Actie -->
      <button type="button" class="pb-btn pb-btn--secondary pb-btn--full hub-feedback-btn" (click)="openFeedback()">
        <span class="material-symbols-outlined">add_comment</span>
        <span>Direct feedback geven</span>
      </button>

      <!-- Versie Footer -->
      <footer class="hub-version mono">
        <span>PokéBinder · {{ platform.runtimeLabel() }} · Web v{{ updates.currentWebVersion() }}</span>
        @if (platform.isNative()) {
          <span>· APK v{{ updates.currentNativeVersion() }}</span>
        }
      </footer>
    </div>
  `,
  styles: [
    `
      @use 'tokens' as *;
      @use 'mixins' as *;

      .hub-menu {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.65rem $margin-mobile 0.25rem;
        max-width: 960px;
        margin: 0 auto;

        @include mq-md {
          padding: $space-lg $margin-desktop $space-xl;
          gap: $space-lg;
        }

        &__groups {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.65rem;

          @include mq-md {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: $space-lg;
            align-items: start;
          }
        }
      }

      .status-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: $space-sm;
        padding: 0.55rem 0.85rem;
        background-color: $color-surface-low;

        @include mq-md {
          padding: 0.8rem 0.95rem;
        }

        &__left {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          min-width: 0;
        }

        &__copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;

          strong {
            @include type-body-md;
            font-weight: 700;
            color: $color-on-surface;
            @include truncate;
          }

          span {
            @include type-data-sm;
            color: $color-on-surface-muted;
            @include truncate;
          }
        }

        &__refresh {
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          min-width: 38px;
          min-height: 38px;

          @include mq-md {
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
          }
        }
      }

      .hub-section {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;

        @include mq-md {
          gap: 0.45rem;
        }

        &__title {
          @include type-data-sm;
          text-transform: uppercase;
          color: $color-on-surface-muted;
          padding-left: 0.25rem;
          font-weight: 700;
          letter-spacing: 0.06em;
        }
      }

      .hub-list {
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .hub-row {
        @include touch-target(50px);
        @include pressable;
        display: flex;
        align-items: center;
        gap: 0.7rem;
        padding: 0.5rem 0.85rem;
        text-align: left;
        border-bottom: 1px solid rgba($color-outline-variant, 0.4);

        @include mq-md {
          @include touch-target(58px);
          gap: 0.8rem;
          padding: 0.75rem 0.9rem;
        }

        &:last-child {
          border-bottom: none;
        }

        @media (hover: hover) and (pointer: fine) {
          &:hover {
            background-color: $color-surface-high;
          }
        }

        &__icon {
          width: 34px;
          height: 34px;
          border-radius: $radius-md;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;

          @include mq-md {
            width: 38px;
            height: 38px;
          }

          .material-symbols-outlined {
            font-size: 20px;
          }

          &--emerald {
            background-color: rgba($color-secondary, 0.16);
            color: $color-secondary;
          }

          &--coral {
            background-color: rgba($color-primary-container, 0.18);
            color: $color-primary-container;
          }

          &--amber {
            background-color: rgba($color-tertiary, 0.16);
            color: $color-tertiary;
          }

          &--slate {
            background-color: $color-surface-highest;
            color: $color-on-surface-variant;
          }
        }

        &__copy {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;

          strong {
            @include type-body-md;
            font-weight: 700;
            color: $color-on-surface;
            @include truncate;
          }

          span {
            @include type-body-sm;
            color: $color-on-surface-muted;
            @include truncate;
          }
        }

        &__chev {
          color: $color-on-surface-muted;
          font-size: 20px;
          flex-shrink: 0;
        }
      }

      .hub-feedback-btn {
        min-height: 44px;
        padding: 0.5rem 1rem;
      }

      .hub-version {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.25rem;
        text-align: center;
        font-size: 0.68rem;
        color: $color-on-surface-muted;
        padding-top: 0;

        @include mq-md {
          font-size: 0.7rem;
          padding-top: $space-xs;
        }
      }
    `,
  ],
})
export class MoreHubComponent {
  readonly store = inject(CollectionStore);
  readonly feedback = inject(FeedbackStore);
  readonly updates = inject(AppUpdateService);
  readonly platform = inject(PlatformService);
  readonly haptics = inject(HapticsService);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;

  readonly activeSetsCount = computed(() => this.store.activeSets().length);
  readonly avgSetProgress = computed(() => {
    const sets = this.store.activeSets();
    if (sets.length === 0) return 0;
    const avg = sets.reduce((sum, s) => sum + s.progressPercent, 0) / sets.length;
    return Math.round(avg * 10) / 10;
  });

  readonly openWishlistCount = computed(() => this.store.portfolio().openWishlistCount);
  readonly openWishlistBudget = computed(() => this.store.portfolio().openWishlistBudget);

  readonly tradeCount = computed(() => this.store.portfolio().tradeCount);
  readonly tradeValue = computed(() => this.store.portfolio().tradeValue);

  readonly syncHeadline = computed(() => {
    if (this.store.config().demoMode) return 'Demo-modus actief';
    if (this.store.syncStatus() === 'unconfigured') return 'Nog geen Google Sheet gekoppeld';
    const prof = this.store.activeProfile();
    if (prof) {
      return `${prof.role === 'test' ? 'Test' : 'Live'}: ${prof.name}`;
    }
    if (!this.store.isOnline()) return 'Offline snapshot';
    if (this.store.syncStatus() === 'error') return 'Synchronisatie-fout';
    return 'Google Sheets verbonden';
  });

  readonly syncSubline = computed(() => {
    const pending = this.store.pendingQueue().length;
    const syncedAt = this.store.syncedAt();
    const timePart = syncedAt
      ? `Laatste sync: ${new Date(syncedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
      : 'Tik rechts om te verversen';
    if (pending > 0) {
      return `${timePart} · ${pending} in wachtrij`;
    }
    return timePart;
  });

  refreshSync(): void {
    void this.haptics.light();
    void this.store.syncFromRemote();
  }

  openFeedback(): void {
    void this.haptics.light();
    this.feedback.openComposer('Algemeen / Hele app');
  }
}
