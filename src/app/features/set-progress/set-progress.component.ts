import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { formatEur, formatPercent } from '../../core/domain/card-math.utils';
import { SetProgress } from '../../core/domain/models';
import { isEditableEventTarget } from '../../core/platform/keyboard.utils';
import { CollectionStore } from '../../core/state/collection.store';

@Component({
  selector: 'app-set-progress',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './set-progress.component.html',
  styleUrl: './set-progress.component.scss',
})
export class SetProgressComponent {
  readonly store = inject(CollectionStore);
  private readonly router = inject(Router);

  readonly formatEur = formatEur;
  readonly formatPercent = formatPercent;

  readonly query = signal('');
  readonly sortBy = signal<'progress' | 'value' | 'name'>('progress');
  readonly showInactiveSets = signal(false);

  readonly inactiveSetsCount = computed(
    () => this.store.setProgress().filter((s) => s.ownedUnique <= 0).length
  );

  readonly filteredSets = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sort = this.sortBy();
    const source = this.showInactiveSets() ? this.store.setProgress() : this.store.activeSets();

    const list = source.filter((s) => {
      if (!q) return true;
      return `${s.setName} ${s.series} ${s.setCode ?? ''}`.toLowerCase().includes(q);
    });

    return [...list].sort((a, b) => {
      if (sort === 'value') return b.totalSetValue - a.totalSetValue;
      if (sort === 'name') return a.setName.localeCompare(b.setName, 'nl');
      return b.progressPercent - a.progressPercent || b.totalSetValue - a.totalSetValue;
    });
  });

  readonly stats = computed(() => {
    const activeSets = this.store.activeSets();
    const totalValue = activeSets.reduce((acc, s) => acc + s.totalSetValue, 0);
    const totalOwned = activeSets.reduce((acc, s) => acc + s.ownedUnique, 0);
    const avgPct =
      activeSets.length > 0
        ? Math.round((activeSets.reduce((acc, s) => acc + s.progressPercent, 0) / activeSets.length) * 10) / 10
        : 0;
    return { count: activeSets.length, totalValue, totalOwned, avgPct };
  });

  openSetInCollection(set: SetProgress): void {
    this.store.requestedSetFilter.set(set.setName);
    void this.router.navigateByUrl('/collectie');
  }

  addCardFromSet(set: SetProgress, event?: Event): void {
    event?.stopPropagation();
    this.store.requestedQuickAddSearch.set({
      mode: 'sets',
      query: set.setName || set.setCode || '',
    });
    void this.router.navigateByUrl('/toevoegen');
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableEventTarget(event.target)) return;
    event.preventDefault();
    const input = document.getElementById('sets-search-input') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }
}
