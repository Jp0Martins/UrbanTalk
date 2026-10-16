import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { toParams } from './api.service';
import { CommunityExplore, DiscussionComment, ForumDetail, ForumInput, ForumPage, ForumSort, MyParticipation, Page, Proposal, ProposalDetail, ProposalFilters, ProposalStatus, Topic, TopicDetail, TopicSort } from './models';

export type CommentTarget = 'topics' | 'proposals';

// fóruns da comunidade, discussões e propostas
@Injectable({ providedIn: 'root' })
export class ParticipationApi {
  private http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  forums(f: { q?: string | null; theme?: string | null; neighborhood?: string | null; kind?: string | null; following?: '1' | null; sort?: ForumSort; page?: number; pageSize?: number } = {}) {
    return this.http.get<ForumPage>(`${this.api}/forums`, { params: toParams(f) });
  }
  forum(slug: string) {
    return this.http.get<ForumDetail>(`${this.api}/forums/${encodeURIComponent(slug)}`);
  }
  createForum(data: ForumInput) {
    return this.http.post<ForumDetail>(`${this.api}/forums`, data);
  }
  updateForum(slug: string, data: Partial<ForumInput>) {
    return this.http.patch<ForumDetail>(`${this.api}/forums/${encodeURIComponent(slug)}`, data);
  }
  followForum(slug: string, on: boolean) {
    const url = `${this.api}/forums/${encodeURIComponent(slug)}/follow`;
    return on ? this.http.put<{ following: boolean; followers: number }>(url, {}) : this.http.delete<{ following: boolean; followers: number }>(url);
  }
  topics(slug: string, f: { sort?: TopicSort; q?: string | null; tag?: string | null; page?: number }) {
    return this.http.get<Page<Topic>>(`${this.api}/forums/${encodeURIComponent(slug)}/topics`, { params: toParams(f) });
  }
  createTopic(slug: string, data: { title: string; body: string; tags?: string[]; occurrenceId?: number | null; proposalId?: number | null }) {
    return this.http.post<TopicDetail>(`${this.api}/forums/${encodeURIComponent(slug)}/topics`, data);
  }
  communityExplore() {
    return this.http.get<CommunityExplore>(`${this.api}/community-explore`);
  }
  myParticipation() {
    return this.http.get<MyParticipation>(`${this.api}/me/participation`);
  }
  topicVote(id: number, on: boolean) {
    const url = `${this.api}/topics/${id}/vote`;
    return on ? this.http.put<{ votes: number; votedByMe: boolean }>(url, {}) : this.http.delete<{ votes: number; votedByMe: boolean }>(url);
  }
  commentVote(id: number, on: boolean) {
    const url = `${this.api}/discussions/comments/${id}/vote`;
    return on ? this.http.put<{ votes: number; votedByMe: boolean }>(url, {}) : this.http.delete<{ votes: number; votedByMe: boolean }>(url);
  }
  topic(id: number) {
    return this.http.get<TopicDetail>(`${this.api}/topics/${id}`);
  }
  deleteTopic(id: number) {
    return this.http.delete<void>(`${this.api}/topics/${id}`);
  }
  topicFlags(id: number, flags: { pinned?: boolean; locked?: boolean }) {
    return this.http.patch<TopicDetail>(`${this.api}/topics/${id}/flags`, flags);
  }

  comments(target: CommentTarget, id: number, after: number | null = null) {
    return this.http.get<{ items: DiscussionComment[]; nextAfter: number | null }>(`${this.api}/${target}/${id}/comments`, { params: toParams({ after }) });
  }
  comment(target: CommentTarget, id: number, body: string, parentId: number | null) {
    return this.http.post<DiscussionComment>(`${this.api}/${target}/${id}/comments`, { body, parentId });
  }
  deleteComment(id: number) {
    return this.http.delete<void>(`${this.api}/discussions/comments/${id}`);
  }
  follow(target: CommentTarget, id: number, on: boolean) {
    const url = `${this.api}/${target}/${id}/follow`;
    return on ? this.http.put<{ following: boolean }>(url, {}) : this.http.delete<{ following: boolean }>(url);
  }

  proposalStatuses() {
    return this.http.get<{ statuses: ProposalStatus[] }>(`${this.api}/proposal-statuses`);
  }
  proposals(f: ProposalFilters, page = 1, pageSize = 12) {
    return this.http.get<Page<Proposal>>(`${this.api}/proposals`, { params: toParams({ ...f, page, pageSize }) });
  }
  proposal(id: number) {
    return this.http.get<ProposalDetail>(`${this.api}/proposals/${id}`);
  }
  createProposal(data: FormData) {
    return this.http.post<ProposalDetail>(`${this.api}/proposals`, data);
  }
  deleteProposal(id: number) {
    return this.http.delete<void>(`${this.api}/proposals/${id}`);
  }
  vote(id: number, on: boolean) {
    const url = `${this.api}/proposals/${id}/vote`;
    return on ? this.http.put<{ votes: number; votedByMe: boolean }>(url, {}) : this.http.delete<{ votes: number; votedByMe: boolean }>(url);
  }
  proposalStatus(id: number, status: string, note: string) {
    return this.http.patch<ProposalDetail>(`${this.api}/proposals/${id}/status`, { status, note });
  }
  linkOccurrence(id: number, occurrenceId: number, on: boolean) {
    const url = `${this.api}/proposals/${id}/occurrences/${occurrenceId}`;
    return on ? this.http.put<ProposalDetail>(url, {}) : this.http.delete<ProposalDetail>(url);
  }

  interests() {
    return this.http.get<{ neighborhoods: string[] }>(`${this.api}/me/interests`);
  }
  setInterests(neighborhoods: string[]) {
    return this.http.put<{ neighborhoods: string[] }>(`${this.api}/me/interests`, { neighborhoods });
  }
}
