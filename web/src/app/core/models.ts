// user = cliente; staff = funcionário; admin = funcionário que também gerencia status e equipe
export type Role = 'user' | 'staff' | 'admin';

// slug do status; a lista vem da API (tabela statuses), nada fixo no front
export type Status = string;

export const STATUS_COLORS = ['ambar', 'azul', 'verde', 'violeta', 'petroleo', 'laranja', 'cinza', 'vermelho'] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];
export const COLOR_NAMES: Record<StatusColor, string> = {
  ambar: 'Âmbar',
  azul: 'Azul',
  verde: 'Verde',
  violeta: 'Violeta',
  petroleo: 'Petróleo',
  laranja: 'Laranja',
  cinza: 'Cinza',
  vermelho: 'Vermelho',
};

export interface StatusDef {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: StatusColor;
  isClosed: boolean;
  countsAsResolved?: boolean;
  isInitial: boolean;
  active: boolean;
  sortOrder: number;
}

export interface StatusAdmin extends StatusDef {
  usage: { occurrences: number; history: number };
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  requiresDetail: boolean;
}

// bairro digitado livremente; a chave normalizada (sem acento, minúsculas) agrupa grafias iguais
export interface Neighborhood {
  name: string;
  key: string;
}

// onde a reclamação se aplica
export type Scope = 'cidade' | 'bairro';
export const CITY_WIDE = 'Cidade toda';

// mesma normalização do servidor: sem acentos, minúsculas, só letras e números
export const placeKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface PlaceSuggestion {
  key: string;
  name: string;
  uses: number;
}

export interface Occurrence {
  id: number;
  code: string;
  category: Pick<Category, 'id' | 'slug' | 'name' | 'icon'>;
  categoryDetail: string | null;
  scope: Scope;
  neighborhood: Neighborhood | null;
  street: string | null;
  description: string;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
  photoUrl: string | null;
  status: Status;
  isClosed: boolean;
  confirmations: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
  confirmedByMe: boolean;
}

export interface HistoryEntry {
  id: number;
  fromStatus: Status | null;
  toStatus: Status;
  note: string | null;
  createdAt: string;
  changedBy: 'cidadao' | 'equipe' | 'sistema';
  changedByName?: string | null;
}

export interface PublicUpdate {
  id: number;
  body: string;
  createdAt: string;
}

export interface TimelineItem {
  key: string;
  kind: string;
  at: string;
  actor: 'cidadao' | 'equipe' | 'comunidade' | 'sistema';
  actorName: string | null;
  visibility: 'publica' | 'interna' | 'autor';
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

export interface EvidencePhoto {
  id: number;
  url: string;
  caption: string | null;
  createdAt: string;
}

export interface Resolution {
  id: number;
  status: Status;
  description: string | null;
  createdAt: string;
  resolvedBy: string | null;
  evidence: { antes: EvidencePhoto[]; depois: EvidencePhoto[] };
  levels: { informada: boolean; comEvidencias: boolean; confirmadaPelaComunidade: boolean };
  feedback: { resolvido: number; persiste: number; mine: 'resolvido' | 'persiste' | null; comments: { verdict: string; comment: string; name: string; createdAt: string }[] };
  canGiveFeedback: boolean;
}

export interface OccurrenceDetail extends Occurrence {
  history: HistoryEntry[];
  publicUpdates: PublicUpdate[];
  timeline: TimelineItem[];
  resolution: Resolution | null;
  previousResolutions: number;
  reopenedCount: number;
  reviewRequested: boolean;
  infoRequest: { id: number; question: string; createdAt: string } | null;
}

export type Priority = 'baixa' | 'media' | 'alta';
export const PRIORITY_NAMES: Record<Priority, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

export interface StaffNote {
  id: number;
  visibility: 'interna' | 'publica';
  body: string;
  createdAt: string;
  authorName: string;
}

export interface StaffOccurrenceDetail extends OccurrenceDetail {
  reporter: { name: string; email: string };
  notes: StaffNote[];
  priority: Priority | null;
  priorityReason: string | null;
  assignee: { id: number; name: string; since: string } | null;
  duplicateOf: number | null;
  reviewRequestedAt: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  latestId?: number;
}

export interface MapMarker {
  id: number;
  code: string;
  latitude: number;
  longitude: number;
  status: Status;
  categoryId: number;
  categoryIcon: string;
  categoryName: string;
  scope?: Scope;
  neighborhoodName: string | null;
  street?: string | null;
  confirmations: number;
  createdAt: string;
  description?: string;
  photoUrl?: string | null;
  isClosed?: boolean;
}

export interface Filters {
  category?: number | null;
  neighborhood?: string | null;
  scope?: Scope | null;
  status?: Status | null;
  situation?: 'abertas' | 'encerradas' | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
  street?: string | null;
}

export interface UserSummary {
  total: number;
  open: number;
  closed: number;
  resolved: number;
  byStatus: { status: Status; count: number }[];
  confirmationsReceived: number;
  confirmationsGiven: number;
}

export interface Indicators {
  extra?: ExtraIndicators;
  period: { from: string; to: string; explicit: boolean };
  total: number;
  open: number;
  closed: number;
  resolved: number;
  confirmations: number;
  demoCount: number;
  byStatus: { status: Status; name: string; color: StatusColor; closed: boolean; count: number }[];
  byCategory: { id: number; slug: string; name: string; icon: string; count: number }[];
  byNeighborhood: { key: string | null; name: string; count: number }[];
  granularity: 'day' | 'week' | 'month';
  timeline: { start: string; count: number }[];
}

export interface StaffOverview {
  initialStatus: Status;
  waiting: number;
  open: number;
  stale: number;
  lastDay: number;
  total: number;
  latestId: number;
}

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface PostAuthor {
  name: string;
  initials: string;
  isStaff: boolean;
  isMe: boolean;
  isDemo: boolean;
}

export interface Post {
  id: number;
  body: string;
  createdAt: string;
  author: PostAuthor;
  occurrence: {
    id: number;
    code: string;
    status: Status;
    categoryName: string;
    categoryIcon: string;
    neighborhoodName: string;
    street: string | null;
  } | null;
  likes: number;
  comments: number;
  likedByMe: boolean;
  canDelete: boolean;
  canReport?: boolean;
}

export interface PostComment {
  id: number;
  body: string;
  createdAt: string;
  author: PostAuthor;
  canDelete: boolean;
  canReport?: boolean;
}

export type FeedFilter = 'recentes' | 'ocorrencias' | 'minhas';

// mesma área aceita pela API; a validação definitiva acontece no servidor
export const SOROCABA_BOUNDS = { minLat: -23.7, maxLat: -23.3, minLng: -47.7, maxLng: -47.25 };
export const insideSorocaba = (lat: number, lng: number) =>
  lat >= SOROCABA_BOUNDS.minLat && lat <= SOROCABA_BOUNDS.maxLat && lng >= SOROCABA_BOUNDS.minLng && lng <= SOROCABA_BOUNDS.maxLng;

export const MAX_PHOTO_MB = 5;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const isStaffRole = (r: Role | undefined | null) => r === 'staff' || r === 'admin';

// nome do lugar: bairro digitado ou "Cidade toda"
export const placeLabel = (o: { neighborhood: { name: string } | null }) => o.neighborhood?.name ?? CITY_WIDE;

// endereço legível: rua, bairro (sem confundir com coordenadas)
export const addressLine = (o: { street: string | null; neighborhood: { name: string } | null }) =>
  o.street ? `${o.street}, ${placeLabel(o)}` : placeLabel(o);

export const categoryLabel = (o: { category: { name: string }; categoryDetail: string | null }) =>
  o.categoryDetail ? `${o.category.name}: ${o.categoryDetail}` : o.category.name;

// participação: fóruns, discussões e propostas
export interface Author {
  name: string;
  initials: string;
  isStaff: boolean;
  isMe: boolean;
  isDemo: boolean;
}

export type ForumKind = 'oficial' | 'comunidade';
export type ForumStatus = 'ativo' | 'pendente' | 'recusado';

export interface ForumTheme {
  id: string;
  name: string;
  icon: string;
  forums?: number;
}

export interface Forum {
  id: number;
  slug: string;
  name: string;
  description: string;
  kind: ForumKind;
  theme: { id: string; name: string };
  tags: string[];
  neighborhoodName: string | null;
  rules: string;
  icon: string;
  status: ForumStatus;
  active: boolean;
  createdAt: string;
  creator: { name: string; isMe: boolean; isDemo: boolean } | null;
  isOwner: boolean;
  topics: number;
  participants: number;
  followers: number;
  lastActivity: string | null;
  following?: boolean;
}

export interface AdminForum extends Forum {
  hidden: boolean;
  creatorFullName: string | null;
}

export interface ForumDetail extends Forum {
  following: boolean;
  hidden: boolean;
  canEdit: boolean;
  canModerate: boolean;
  canPost: boolean;
  canReport: boolean;
}

export interface ForumPage extends Page<Forum> {
  themes: ForumTheme[];
}

export interface ForumInput {
  name?: string;
  description: string;
  theme: string;
  tags: string[];
  neighborhoodName: string;
  rules: string;
}

// mesmos temas do servidor (seed-base FORUM_THEMES)
export const FORUM_THEME_OPTIONS: { id: string; name: string }[] = [
  { id: 'mobilidade', name: 'Mobilidade urbana' },
  { id: 'infraestrutura', name: 'Infraestrutura e ruas' },
  { id: 'iluminacao', name: 'Iluminação pública' },
  { id: 'meio-ambiente', name: 'Meio ambiente e limpeza' },
  { id: 'acessibilidade', name: 'Acessibilidade' },
  { id: 'seguranca-viaria', name: 'Segurança viária' },
  { id: 'ideias', name: 'Ideias e propostas' },
  { id: 'duvidas', name: 'Dúvidas e orientações' },
  { id: 'comunidade', name: 'Comunidade e bairros' },
];

export type ForumSort = 'atividade' | 'populares' | 'novos' | 'nome';
export type TopicSort = 'atividade' | 'populares' | 'recentes' | 'respostas';

export interface Topic {
  id: number;
  title: string;
  excerpt: string;
  tags: string[];
  isInstitutional: boolean;
  author: Author | null;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  lastActivityAt: string;
  replies: number;
  votes: number;
  votedByMe: boolean;
  canVote: boolean;
  occurrenceCode: string | null;
  forum: { slug: string; name: string; kind: ForumKind };
}

export interface MyParticipation {
  createdForums: Forum[];
  followedForums: Forum[];
  myTopics: Topic[];
  commentedTopics: Topic[];
  feedPosts: number;
}

export interface CommunityExplore {
  popular: Topic[];
  newest: Topic[];
  newForums: Forum[];
  tags: { tag: string; count: number }[];
  themes: ForumTheme[];
}

export interface LinkedOccurrence {
  id: number;
  code: string;
  status: Status;
  street: string | null;
  category: string;
  icon: string;
  neighborhood: string;
}

export interface TopicDetail extends Topic {
  body: string;
  occurrence: LinkedOccurrence | null;
  proposal: { id: number; title: string; status: string } | null;
  following: boolean;
  canDelete: boolean;
  canModerate: boolean;
  canReport: boolean;
}

export interface DiscussionComment {
  id: number;
  body: string;
  createdAt: string;
  parentId: number | null;
  replyTo: { name: string | null; excerpt: string | null } | null;
  author: Author;
  votes?: number;
  votedByMe?: boolean;
  canVote?: boolean;
  canDelete: boolean;
  canReport: boolean;
}

export interface ProposalStatus {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: StatusColor;
  isInitial: boolean;
  isFinal: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Proposal {
  id: number;
  title: string;
  excerpt: string;
  status: string;
  isFinal: boolean;
  category: { id: number; name: string; icon: string } | null;
  neighborhood: Neighborhood | null;
  votes: number;
  votedByMe: boolean;
  canVote: boolean;
  comments: number;
  imageUrl: string | null;
  author: Author;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalDetail extends Proposal {
  body: string;
  referenceUrl: string | null;
  images: string[];
  history: { id: number; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string; byStaff: boolean }[];
  occurrences: LinkedOccurrence[];
  following: boolean;
  isMine: boolean;
  canLink: boolean;
  canChangeStatus: boolean;
  canDelete: boolean;
  canReport: boolean;
}

export type ProposalSort = 'votos' | 'recentes' | 'em-alta';

export interface ProposalFilters {
  sort?: ProposalSort;
  category?: number | null;
  neighborhood?: string | null;
  status?: string | null;
  situation?: 'abertas' | 'finais' | null;
  q?: string | null;
  mine?: '1' | null;
}

// código UT-00012 → 12
export const parseOccurrenceCode = (s: string) => {
  const m = /^\s*(?:ut-?)?0*(\d{1,7})\s*$/i.exec(s);
  return m ? Number(m[1]) : null;
};

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string;
  count: number;
  createdAt: string;
  read: boolean;
}

// fila de análise e administração
export interface QueueItem {
  id: number;
  code: string;
  category: { id: number; name: string; icon: string };
  categoryDetail: string | null;
  scope: Scope;
  neighborhood: Neighborhood | null;
  street: string | null;
  description: string;
  status: Status;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
  confirmations: number;
  priority: Priority | null;
  priorityReason: string | null;
  assignee: { id: number; name: string } | null;
  duplicateOf: number | null;
  reviewRequested: boolean;
  pendingInfo: boolean;
  isDemo: boolean;
  daysOpen: number;
  daysIdle: number;
  overdue: boolean;
  stale: boolean;
  score: number;
  scoreParts: { label: string; points: number }[];
  similar: number;
}

export interface PrioritySettings {
  priorityAlta: number;
  priorityMedia: number;
  priorityBaixa: number;
  priorityNone: number;
  perConfirmation: number;
  maxConfirmations: number;
  perDay: number;
  maxDays: number;
  staleBonus: number;
  staleDays: number;
  reviewBonus: number;
  overdueDays: number;
}

export interface QueuePage extends Page<QueueItem> {
  truncated: boolean;
  summary: { total: number; mine: number; unassigned: number; overdue: number; stale: number; review: number };
  settings: PrioritySettings;
}

export interface QueueFilters extends Filters {
  view?: 'todas' | 'minhas' | 'sem-responsavel';
  priority?: Priority | 'nenhuma' | null;
  flag?: 'atrasadas' | 'paradas' | 'reavaliacao' | 'pedido-pendente' | 'duplicatas' | null;
  sort?: string;
}

export interface SimilarOccurrence {
  id: number;
  code: string;
  status: Status;
  isClosed: boolean;
  street: string | null;
  neighborhood: string;
  description: string;
  createdAt: string;
  confirmations: number;
  distanceM: number;
  duplicateOf: number | null;
  linked: boolean;
}

export interface StaffMember {
  id: number;
  name: string;
  role: Role;
}

export interface ModerationContent {
  type: 'post' | 'post_comment' | 'proposal' | 'topic' | 'comment';
  id: number;
  label: string;
  text: string;
  authorName: string | null;
  authorPublic: string | null;
  createdAt: string;
  hiddenAt: string | null;
  hiddenReason: string | null;
  link: string;
  moderatorName?: string | null;
}

export interface ReportGroup {
  content: ModerationContent;
  reports: number;
  firstAt: string;
  lastAt: string;
  reasons: { reason: string; label: string; count: number }[];
  details: string[];
}

export interface ActivityBlock {
  days: number;
  posts: number;
  topics: number;
  comments: number;
  proposals: number;
  votes: number;
  reports: number;
  activePeople: number;
}

export interface AuditEntry {
  id: number;
  action: string;
  targetType: string;
  targetId: number | null;
  details: unknown;
  createdAt: string;
  actorName: string;
  actorRole: Role | null;
}

export interface CategoryAdmin {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  requiresDetail: boolean;
  active: boolean;
  sortOrder: number;
  usage: number;
}

// visualização: concentração, bairros, indicadores comparativos, explorar e busca
export interface HeatCell {
  south: number;
  west: number;
  north: number;
  east: number;
  count: number;
  open: number;
}

export interface HeatGrid {
  total: number;
  cellMeters: number;
  minSample: number;
  reliable: boolean;
  max: number;
  cells: HeatCell[];
}

export interface NeighborhoodItem {
  key: string;
  name: string;
  total: number;
  open: number;
  resolved: number;
  center: { latitude: number; longitude: number } | null;
  categories: { id: number; name: string; icon: string; count: number }[];
  recurring: { id: number; name: string; icon: string; count: number }[];
}

export interface NeighborhoodSummary {
  total: number;
  items: NeighborhoodItem[];
  cityWide: { total: number; open: number; resolved: number };
  rankings: { minSample: number; mostOpen: { key: string; name: string; value: number; total: number }[]; mostResolved: { key: string; name: string; value: number; total: number }[] };
}

export interface Delta {
  current: number;
  previous: number;
  diff: number;
  pct: number | null;
}

export interface ExtraIndicators {
  resolutionTime: { sample: number; minSample: number; enough: boolean; meanDays: number | null; medianDays: number | null };
  reopened: number;
  reportedUnresolved: number;
  comparison: { current: { from: string; to: string }; previous: { from: string; to: string }; total: Delta; resolved: Delta; open: Delta };
  topProposals: { id: number; title: string; status: string; statusName: string; neighborhood: string | null; votes: number }[];
}

export interface ExploreOccurrence {
  id: number;
  code: string;
  status: Status;
  street: string | null;
  description: string;
  createdAt: string;
  category: string;
  icon: string;
  neighborhood: string;
  photoUrl: string | null;
  isDemo: boolean;
  distanceM: number | null;
}

export interface ExploreData {
  recent: ExploreOccurrence[];
  near: ExploreOccurrence[];
  nearMode: 'local' | 'bairro' | null;
  nearRadiusM: number;
  topics: { id: number; title: string; forum: string; forumSlug: string; replies: number; lastActivityAt: string; isInstitutional: boolean }[];
  proposals: { id: number; title: string; status: string; neighborhood: string | null; votes: number }[];
  neighborhoods: { key: string; name: string; occurrences: number; topics: number; proposals: number; total: number }[];
  resolutions: { occurrenceId: number; code: string; at: string; description: string | null; category: string; icon: string; place: string; withEvidence: boolean; communityConfirmed: boolean }[];
  isLoggedIn: boolean;
}

export type SearchType = 'todos' | 'ocorrencias' | 'propostas' | 'topicos' | 'foruns' | 'publicacoes';

export interface SearchHit {
  id: number | string;
  code?: string;
  title: string;
  text: string;
  place?: string;
  status?: string;
  icon?: string;
  isInstitutional?: boolean;
  createdAt?: string;
  link: string;
}

export interface SearchResult {
  q: string;
  type: SearchType;
  groups?: Record<Exclude<SearchType, 'todos'>, { total: number; items: SearchHit[] }>;
  items?: SearchHit[];
  page?: number;
  total?: number;
  totalPages?: number;
  publicOnly: boolean;
}
