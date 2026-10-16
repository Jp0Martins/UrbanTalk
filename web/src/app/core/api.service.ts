import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Category,
  ExploreData,
  FeedFilter,
  HeatGrid,
  NeighborhoodSummary,
  SearchResult,
  SearchType,
  Filters,
  Indicators,
  MapMarker,
  PlaceSuggestion,
  Scope,
  Occurrence,
  OccurrenceDetail,
  Page,
  Post,
  PostComment,
  StaffOccurrenceDetail,
  StaffOverview,
  StatusAdmin,
  StatusColor,
  StatusDef,
  Status,
  TeamMember,
  UserSummary,
} from './models';

export type Sort = 'recent' | 'oldest' | 'confirmations';

// converte filtros em query string, ignorando campos vazios
export function toParams(f: object = {}) {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // catálogos mudam pouco: uma requisição por sessão de uso
  readonly categories$: Observable<Category[]> = this.http
    .get<{ categories: Category[] }>(`${this.api}/categories`)
    .pipe(map((r) => r.categories), shareReplay({ bufferSize: 1, refCount: false }));

  // nomes de bairro já digitados por outras pessoas; só sugestão, nunca lista fechada
  placeSuggestions(q: string) {
    return this.http.get<{ neighborhoods: PlaceSuggestion[] }>(`${this.api}/neighborhoods`, { params: toParams({ q }) }).pipe(map((r) => r.neighborhoods));
  }

  list(filters: Filters, page = 1, pageSize = 20, sort: Sort = 'recent') {
    return this.http.get<Page<Occurrence>>(`${this.api}/occurrences`, { params: toParams({ ...filters, page, pageSize, sort }) });
  }

  markers(filters: Filters) {
    return this.http.get<{ markers: MapMarker[]; truncated: boolean; withoutPoint?: number }>(`${this.api}/occurrences/map`, { params: toParams(filters) });
  }

  heat(filters: Filters) {
    return this.http.get<HeatGrid>(`${this.api}/occurrences/heat`, { params: toParams(filters) });
  }

  neighborhoodSummary(filters: Filters) {
    return this.http.get<NeighborhoodSummary>(`${this.api}/occurrences/neighborhoods`, { params: toParams(filters) });
  }

  explore(params: { lat?: number; lng?: number; neighborhood?: string | null }) {
    return this.http.get<ExploreData>(`${this.api}/explore`, { params: toParams(params) });
  }

  search(q: string, type: SearchType, extra: { category?: number | null; neighborhood?: string | null; page?: number }) {
    return this.http.get<SearchResult>(`${this.api}/search`, { params: toParams({ q, type, ...extra }) });
  }

  reportCsv(filters: Filters) {
    return this.http.get(`${this.api}/admin/reports/occurrences.csv`, { params: toParams(filters), responseType: 'blob', observe: 'response' });
  }

  get(id: number) {
    return this.http.get<OccurrenceDetail>(`${this.api}/occurrences/${id}`);
  }

  // a chave evita duplicar a reclamação se o envio for repetido
  create(data: FormData, idempotencyKey: string) {
    return this.http.post<OccurrenceDetail>(`${this.api}/occurrences`, data, { headers: { 'X-Idempotency-Key': idempotencyKey } });
  }

  confirm(id: number) {
    return this.http.post<{ confirmations: number; confirmedByMe: boolean }>(`${this.api}/occurrences/${id}/confirmations`, {});
  }

  mine(filters: Filters, page = 1, pageSize = 20, sort: Sort = 'recent') {
    return this.http.get<Page<Occurrence>>(`${this.api}/me/occurrences`, { params: toParams({ ...filters, page, pageSize, sort }) });
  }

  summary() {
    return this.http.get<UserSummary>(`${this.api}/me/summary`);
  }

  indicators(filters: Filters, granularity: string | null = null) {
    return this.http.get<Indicators>(`${this.api}/admin/indicators`, { params: toParams({ ...filters, granularity }) });
  }

  // área da equipe
  overview() {
    return this.http.get<StaffOverview>(`${this.api}/admin/overview`);
  }

  staffList(filters: Filters, page = 1, pageSize = 20, sort: Sort = 'recent') {
    return this.http.get<Page<Occurrence>>(`${this.api}/admin/occurrences`, { params: toParams({ ...filters, page, pageSize, sort }) });
  }

  staffGet(id: number) {
    return this.http.get<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}`);
  }

  changeStatus(id: number, status: Status, note: string) {
    return this.http.patch<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/status`, { status, note });
  }

  addNote(id: number, visibility: 'interna' | 'publica', body: string) {
    return this.http.post<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/notes`, { visibility, body });
  }

  updateAddress(id: number, data: { scope: Scope; neighborhoodName: string; street: string; reference: string }) {
    return this.http.patch<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/address`, data);
  }

  adminStatuses() {
    return this.http.get<{ statuses: StatusAdmin[]; canManage: boolean }>(`${this.api}/admin/statuses`);
  }

  createStatus(data: { name: string; description: string; color: StatusColor; isClosed: boolean; countsAsResolved?: boolean }) {
    return this.http.post<StatusDef>(`${this.api}/admin/statuses`, data);
  }

  updateStatus(id: number, data: Partial<{ name: string; description: string; color: StatusColor; isClosed: boolean; countsAsResolved: boolean; active: boolean; isInitial: true }>) {
    return this.http.patch<StatusDef>(`${this.api}/admin/statuses/${id}`, data);
  }

  deleteStatus(id: number) {
    return this.http.delete<void>(`${this.api}/admin/statuses/${id}`);
  }

  reorderStatuses(ids: number[]) {
    return this.http.put<{ statuses: StatusDef[] }>(`${this.api}/admin/statuses/order`, { ids });
  }

  team() {
    return this.http.get<{ members: TeamMember[] }>(`${this.api}/admin/team`);
  }

  grantAccess(email: string, role: 'staff' | 'admin') {
    return this.http.post<{ id: number; role: string }>(`${this.api}/admin/team`, { email, role });
  }

  setRole(id: number, role: 'user' | 'staff' | 'admin') {
    return this.http.patch<{ id: number; role: string }>(`${this.api}/admin/team/${id}`, { role });
  }

  // comunidade
  feed(filter: FeedFilter, before: number | null = null, occurrence: number | null = null, limit = 15) {
    return this.http.get<{ items: Post[]; nextBefore: number | null }>(`${this.api}/community/posts`, {
      params: toParams({ filter, before, occurrence, limit }),
    });
  }

  createPost(body: string, occurrenceId: number | null) {
    return this.http.post<Post>(`${this.api}/community/posts`, { body, occurrenceId });
  }

  deletePost(id: number) {
    return this.http.delete<void>(`${this.api}/community/posts/${id}`);
  }

  like(id: number, liked: boolean) {
    const url = `${this.api}/community/posts/${id}/like`;
    return liked
      ? this.http.put<{ likes: number; likedByMe: boolean }>(url, {})
      : this.http.delete<{ likes: number; likedByMe: boolean }>(url);
  }

  comments(postId: number, after: number | null = null) {
    return this.http.get<{ items: PostComment[]; nextAfter: number | null }>(`${this.api}/community/posts/${postId}/comments`, {
      params: toParams({ after }),
    });
  }

  comment(postId: number, body: string) {
    return this.http.post<PostComment>(`${this.api}/community/posts/${postId}/comments`, { body });
  }

  deleteComment(id: number) {
    return this.http.delete<void>(`${this.api}/community/comments/${id}`);
  }

  // acompanhamento: pedidos de informação, avaliação da solução, evidências e resolução
  answerInfo(id: number, requestId: number, data: FormData) {
    return this.http.post<OccurrenceDetail>(`${this.api}/occurrences/${id}/info-requests/${requestId}/answer`, data);
  }

  feedback(id: number, verdict: 'resolvido' | 'persiste', comment: string) {
    return this.http.post<OccurrenceDetail>(`${this.api}/occurrences/${id}/feedback`, { verdict, comment });
  }

  requestInfo(id: number, question: string) {
    return this.http.post<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/info-requests`, { question });
  }

  cancelInfo(id: number, requestId: number) {
    return this.http.delete<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/info-requests/${requestId}`);
  }

  addEvidence(id: number, data: FormData) {
    return this.http.post<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/evidence`, data);
  }

  resolve(id: number, data: FormData) {
    return this.http.post<StaffOccurrenceDetail>(`${this.api}/admin/occurrences/${id}/resolution`, data);
  }

  // baixa o PDF como blob para tratar erros de validação antes de abrir o arquivo
  reportPdf(filters: Filters) {
    return this.http.get(`${this.api}/admin/reports/occurrences.pdf`, {
      params: toParams(filters),
      responseType: 'blob',
      observe: 'response',
    });
  }
}
