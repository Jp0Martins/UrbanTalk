import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { toParams } from './api.service';
import {
  ActivityBlock, AdminForum, AuditEntry, CategoryAdmin, Forum, ModerationContent, Page, PrioritySettings, ProposalStatus, QueueFilters, QueuePage, ReportGroup,
  SimilarOccurrence, StaffMember, StaffOccurrenceDetail, StatusColor, TopicDetail,
} from './models';

export interface SpamReport {
  since: string;
  repeated: { text: string; count: number; authors: string[]; items: { type: string; id: number; label: string; link: string; createdAt: string }[] }[];
  bursts: { name: string; count: number; hourStart: string }[];
}

// fila de análise, moderação e configurações da equipe
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/admin`;

  // exclusão definitiva (só administrador)
  deleteOccurrence(id: number) {
    return this.http.delete<void>(`${this.api}/occurrences/${id}`);
  }

  queue(f: QueueFilters, page = 1) {
    return this.http.get<QueuePage>(`${this.api}/queue`, { params: toParams({ ...f, page }) });
  }
  staffMembers() {
    return this.http.get<{ members: StaffMember[] }>(`${this.api}/staff-members`);
  }
  similar(id: number) {
    return this.http.get<{ items: SimilarOccurrence[] }>(`${this.api}/occurrences/${id}/similar`);
  }
  assign(id: number, userId: number | null) {
    return this.http.patch<StaffOccurrenceDetail>(`${this.api}/occurrences/${id}/assignee`, { userId });
  }
  priority(id: number, priority: string | null, reason: string) {
    return this.http.patch<StaffOccurrenceDetail>(`${this.api}/occurrences/${id}/priority`, { priority, reason });
  }
  duplicate(id: number, of: number | null, note = '') {
    return this.http.patch<StaffOccurrenceDetail>(`${this.api}/occurrences/${id}/duplicate`, { of, note });
  }

  reports(status: string, page = 1) {
    return this.http.get<Page<ReportGroup> & { reasons: Record<string, string> }>(`${this.api}/moderation/reports`, { params: toParams({ status, page }) });
  }
  decide(targetType: string, targetId: number, decision: 'ocultar' | 'manter', reason: string | null, note: string) {
    return this.http.post<{ ok: boolean }>(`${this.api}/moderation/decide`, { targetType, targetId, decision, reason: reason || undefined, note });
  }
  visibility(targetType: string, targetId: number, hidden: boolean, reason?: string) {
    return this.http.post<{ ok: boolean }>(`${this.api}/moderation/visibility`, { targetType, targetId, hidden, reason });
  }
  hidden() {
    return this.http.get<{ items: ModerationContent[] }>(`${this.api}/moderation/hidden`);
  }
  spam() {
    return this.http.get<SpamReport>(`${this.api}/moderation/spam`);
  }
  activity() {
    return this.http.get<{ week: ActivityBlock; month: ActivityBlock; openReports: number }>(`${this.api}/moderation/activity`);
  }

  prioritySettings() {
    return this.http.get<{ settings: PrioritySettings; defaults: PrioritySettings; canManage: boolean }>(`${this.api}/settings/priority`);
  }
  savePriority(s: PrioritySettings) {
    return this.http.put<{ settings: PrioritySettings }>(`${this.api}/settings/priority`, s);
  }
  audit(action: string, page = 1) {
    return this.http.get<Page<AuditEntry> & { actions: string[] }>(`${this.api}/audit`, { params: toParams({ action, page }) });
  }
  categories() {
    return this.http.get<{ categories: CategoryAdmin[]; icons: string[] }>(`${this.api}/categories`);
  }
  createCategory(data: Partial<CategoryAdmin>) {
    return this.http.post<CategoryAdmin>(`${this.api}/categories`, data);
  }
  updateCategory(id: number, data: Partial<CategoryAdmin>) {
    return this.http.patch<CategoryAdmin>(`${this.api}/categories/${id}`, data);
  }
  forums() {
    return this.http.get<{ forums: AdminForum[] }>(`${this.api}/forums`);
  }
  createForum(data: { name: string; description: string; theme: string }) {
    return this.http.post<Forum>(`${this.api}/forums`, data);
  }
  updateForum(id: number, data: Partial<{ name: string; description: string; active: boolean }>) {
    return this.http.patch<Forum>(`${this.api}/forums/${id}`, data);
  }
  forumSettings() {
    return this.http.get<{ approvalRequired: boolean; forumsPerDay: number; canManage: boolean }>(`${this.api}/settings/forums`);
  }
  setForumApproval(approvalRequired: boolean) {
    return this.http.put<{ approvalRequired: boolean }>(`${this.api}/settings/forums`, { approvalRequired });
  }
  pendingForums() {
    return this.http.get<{ forums: (Forum & { creatorFullName: string | null })[] }>(`${this.api}/forums-pending`);
  }
  reviewForum(id: number, decision: 'aprovar' | 'recusar', note = '') {
    return this.http.post<{ status: string }>(`${this.api}/forums/${id}/review`, { decision, note });
  }
  institutionalTopic(slug: string, data: { title: string; body: string }) {
    return this.http.post<TopicDetail>(`${this.api}/forums/${encodeURIComponent(slug)}/institutional-topics`, data);
  }
  proposalStatuses() {
    return this.http.get<{ statuses: ProposalStatus[] }>(`${this.api}/proposal-statuses`);
  }
  createProposalStatus(data: { name: string; description: string; color: StatusColor; isFinal: boolean }) {
    return this.http.post<ProposalStatus>(`${this.api}/proposal-statuses`, data);
  }
  updateProposalStatus(id: number, data: Partial<{ name: string; description: string; color: StatusColor; isFinal: boolean; active: boolean; isInitial: true }>) {
    return this.http.patch<ProposalStatus>(`${this.api}/proposal-statuses/${id}`, data);
  }
}
