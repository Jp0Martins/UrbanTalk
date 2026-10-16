import { Injectable, computed, inject, signal } from '@angular/core';
import { ProposalStatus } from './models';
import { ParticipationApi } from './participation.api';

// fases das propostas, carregadas uma vez e compartilhadas
@Injectable({ providedIn: 'root' })
export class ProposalCatalog {
  private api = inject(ParticipationApi);
  readonly all = signal<ProposalStatus[]>([]);
  readonly active = computed(() => this.all().filter((s) => s.active));
  private loading = false;

  ensure(force = false) {
    if ((this.all().length && !force) || this.loading) return;
    this.loading = true;
    this.api.proposalStatuses().subscribe({
      next: (r) => {
        this.all.set(r.statuses);
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  get(slug: string): ProposalStatus {
    return (
      this.all().find((s) => s.slug === slug) ?? {
        id: 0, slug, name: slug.replace(/-/g, ' '), description: '', color: 'cinza', isInitial: false, isFinal: false, active: false, sortOrder: 0,
      }
    );
  }
}
