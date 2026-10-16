import type { Knex } from 'knex';

// expansão: fila de análise, evidências e resolução, propostas, fóruns e grupos por bairro,
// notificações, denúncias e configurações. só acrescenta: nenhuma tabela existente é recriada.
// colunas com chave estrangeira entram por ALTER TABLE ... ADD COLUMN (aceito pelo SQLite com padrão NULL).

const now = () => new Date().toISOString();

const hiddenCols = (t: Knex.CreateTableBuilder) => {
  // conteúdo ocultado pela moderação continua guardado para auditoria
  t.string('hidden_at', 30).nullable();
  t.integer('hidden_by').nullable().references('users.id').onDelete('SET NULL');
  t.string('hidden_reason', 40).nullable();
};

export async function up(knex: Knex) {
  // status que contam como "resolvido" (encerrado nem sempre é resolvido)
  await knex.raw('ALTER TABLE statuses ADD COLUMN counts_as_resolved boolean NOT NULL DEFAULT 0');
  await knex('statuses').where({ slug: 'resolvida' }).update({ counts_as_resolved: true });

  // ocorrências: prioridade (sem valor = ainda não avaliada), responsável, duplicata confirmada e reaberturas
  await knex.raw("ALTER TABLE occurrences ADD COLUMN priority varchar(10) NULL CHECK (priority IN ('baixa','media','alta'))");
  await knex.raw('ALTER TABLE occurrences ADD COLUMN priority_reason varchar(300) NULL');
  await knex.raw('ALTER TABLE occurrences ADD COLUMN assigned_to integer NULL REFERENCES users(id) ON DELETE SET NULL');
  await knex.raw('ALTER TABLE occurrences ADD COLUMN assigned_at varchar(30) NULL');
  await knex.raw('ALTER TABLE occurrences ADD COLUMN duplicate_of integer NULL REFERENCES occurrences(id) ON DELETE SET NULL');
  await knex.raw('ALTER TABLE occurrences ADD COLUMN reopened_count integer NOT NULL DEFAULT 0');
  // cidadão informou que o problema continua: aguarda reavaliação da equipe
  await knex.raw('ALTER TABLE occurrences ADD COLUMN review_requested_at varchar(30) NULL');
  await knex.raw('CREATE INDEX occurrences_assigned_to_index ON occurrences (assigned_to)');
  await knex.raw('CREATE INDEX occurrences_updated_at_index ON occurrences (updated_at)');

  for (const table of ['posts', 'post_comments']) {
    await knex.raw(`ALTER TABLE ${table} ADD COLUMN hidden_at varchar(30) NULL`);
    await knex.raw(`ALTER TABLE ${table} ADD COLUMN hidden_by integer NULL REFERENCES users(id) ON DELETE SET NULL`);
    await knex.raw(`ALTER TABLE ${table} ADD COLUMN hidden_reason varchar(40) NULL`);
  }

  // linha do tempo detalhada (atribuição, prioridade, pedidos, respostas, evidências, reabertura, duplicata...)
  await knex.schema.createTable('occurrence_events', (t) => {
    t.increments('id').primary();
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('actor_id').nullable().references('users.id').onDelete('SET NULL');
    t.string('kind', 30).notNullable();
    t.string('visibility', 10).notNullable().checkIn(['interna', 'publica']);
    t.text('body').nullable();
    t.text('data').nullable();
    t.string('created_at', 30).notNullable();
    t.index(['occurrence_id']);
  });

  await knex.schema.createTable('occurrence_info_requests', (t) => {
    t.increments('id').primary();
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('requested_by').nullable().references('users.id').onDelete('SET NULL');
    t.text('question').notNullable();
    t.string('created_at', 30).notNullable();
    t.text('answer').nullable();
    t.string('answer_photo', 80).nullable();
    t.string('answered_at', 30).nullable();
    t.string('cancelled_at', 30).nullable();
    t.index(['occurrence_id']);
  });

  await knex.schema.createTable('occurrence_resolutions', (t) => {
    t.increments('id').primary();
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('resolved_by').nullable().references('users.id').onDelete('SET NULL');
    t.string('status', 40).notNullable();
    t.text('description').nullable();
    t.string('created_at', 30).notNullable();
    // preenchido quando a ocorrência é reaberta; o registro antigo permanece
    t.string('superseded_at', 30).nullable();
    t.index(['occurrence_id']);
  });

  await knex.schema.createTable('occurrence_evidence', (t) => {
    t.increments('id').primary();
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('resolution_id').nullable().references('occurrence_resolutions.id').onDelete('SET NULL');
    t.integer('author_id').nullable().references('users.id').onDelete('SET NULL');
    t.string('kind', 16).notNullable().checkIn(['antes', 'depois', 'acompanhamento']);
    t.string('photo_path', 80).notNullable();
    t.string('caption', 200).nullable();
    t.string('created_at', 30).notNullable();
    t.index(['occurrence_id']);
  });

  await knex.schema.createTable('resolution_feedback', (t) => {
    t.increments('id').primary();
    t.integer('resolution_id').notNullable().references('occurrence_resolutions.id').onDelete('CASCADE');
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('verdict', 12).notNullable().checkIn(['resolvido', 'persiste']);
    t.string('comment', 500).nullable();
    t.string('created_at', 30).notNullable();
    // uma avaliação por pessoa para cada resolução informada
    t.unique(['resolution_id', 'user_id']);
  });

  // propostas e seu ciclo de status próprio
  await knex.schema.createTable('proposal_statuses', (t) => {
    t.increments('id').primary();
    t.string('slug', 40).notNullable().unique();
    t.string('name', 40).notNullable().unique();
    t.string('description', 240).notNullable().defaultTo('');
    t.string('color', 16).notNullable().defaultTo('cinza');
    t.boolean('is_initial').notNullable().defaultTo(false);
    // fase final: votação encerrada
    t.boolean('is_final').notNullable().defaultTo(false);
    t.boolean('active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.string('created_at', 30).notNullable();
    t.string('updated_at', 30).notNullable();
  });
  await knex.raw('CREATE UNIQUE INDEX proposal_statuses_um_inicial ON proposal_statuses (is_initial) WHERE is_initial = 1');
  const ts = now();
  const ps = (slug: string, name: string, description: string, color: string, sort: number, extra: Record<string, boolean> = {}) => ({
    slug, name, description, color, sort_order: sort, is_initial: false, is_final: false, active: true, created_at: ts, updated_at: ts, ...extra,
  });
  await knex('proposal_statuses').insert([
    ps('nova', 'Nova proposta', 'Acabou de ser publicada e está aberta para apoio e comentários.', 'ambar', 10, { is_initial: true }),
    ps('em-discussao', 'Em discussão', 'A comunidade está debatendo a ideia nos comentários.', 'azul', 20),
    ps('em-analise', 'Em análise', 'A equipe do UrbanTalk está organizando as informações da proposta.', 'violeta', 30),
    ps('priorizada', 'Priorizada pela comunidade', 'Recebeu muito apoio dos moradores. Isso não significa aprovação oficial.', 'laranja', 40),
    ps('avaliacao-administrativa', 'Em avaliação administrativa', 'Foi levada pela equipe para avaliação de um órgão responsável.', 'petroleo', 50),
    ps('aceita', 'Aceita', 'O órgão responsável informou que vai executar a proposta.', 'verde', 60, { is_final: true }),
    ps('recusada', 'Recusada', 'O órgão responsável informou que a proposta não será executada.', 'vermelho', 70, { is_final: true }),
    ps('implementada', 'Implementada', 'A proposta foi executada.', 'verde', 80, { is_final: true }),
  ]);

  await knex.schema.createTable('proposals', (t) => {
    t.increments('id').primary();
    t.integer('author_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('title', 120).notNullable();
    t.text('body').notNullable();
    t.integer('category_id').nullable().references('categories.id').onDelete('SET NULL');
    t.integer('neighborhood_id').nullable().references('neighborhoods.id').onDelete('SET NULL');
    t.string('status', 40).notNullable().references('proposal_statuses.slug').onDelete('RESTRICT').onUpdate('RESTRICT');
    t.string('reference_url', 300).nullable();
    t.string('created_at', 30).notNullable();
    t.string('updated_at', 30).notNullable();
    hiddenCols(t);
    t.index(['status']);
    t.index(['category_id']);
    t.index(['neighborhood_id']);
    t.index(['created_at']);
  });
  await knex.schema.createTable('proposal_images', (t) => {
    t.increments('id').primary();
    t.integer('proposal_id').notNullable().references('proposals.id').onDelete('CASCADE');
    t.string('photo_path', 80).notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.index(['proposal_id']);
  });
  await knex.schema.createTable('proposal_votes', (t) => {
    t.integer('proposal_id').notNullable().references('proposals.id').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('created_at', 30).notNullable();
    // um voto por pessoa por proposta, garantido pelo banco
    t.primary(['proposal_id', 'user_id']);
  });
  await knex.schema.createTable('proposal_occurrences', (t) => {
    t.integer('proposal_id').notNullable().references('proposals.id').onDelete('CASCADE');
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('linked_by').nullable().references('users.id').onDelete('SET NULL');
    t.string('created_at', 30).notNullable();
    t.primary(['proposal_id', 'occurrence_id']);
  });
  await knex.schema.createTable('proposal_status_history', (t) => {
    t.increments('id').primary();
    t.integer('proposal_id').notNullable().references('proposals.id').onDelete('CASCADE');
    t.string('from_status', 40).nullable();
    t.string('to_status', 40).notNullable();
    t.integer('changed_by').nullable().references('users.id').onDelete('SET NULL');
    t.string('note', 500).nullable();
    t.string('created_at', 30).notNullable();
    t.index(['proposal_id']);
  });

  // fóruns temáticos e grupos de bairro (um por bairro)
  await knex.schema.createTable('forums', (t) => {
    t.increments('id').primary();
    t.string('slug', 60).notNullable().unique();
    t.string('name', 80).notNullable();
    t.string('description', 300).notNullable().defaultTo('');
    t.string('kind', 10).notNullable().checkIn(['tema', 'bairro']);
    t.integer('neighborhood_id').nullable().unique().references('neighborhoods.id').onDelete('CASCADE');
    t.string('icon', 40).notNullable().defaultTo('chat');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.string('created_at', 30).notNullable();
  });
  await knex.schema.createTable('topics', (t) => {
    t.increments('id').primary();
    t.integer('forum_id').notNullable().references('forums.id').onDelete('CASCADE');
    // tópicos de apoio do UrbanTalk não têm autor cidadão
    t.integer('author_id').nullable().references('users.id').onDelete('SET NULL');
    t.boolean('is_institutional').notNullable().defaultTo(false);
    t.string('seed_key', 60).nullable().unique();
    t.string('title', 140).notNullable();
    t.text('body').notNullable();
    t.integer('occurrence_id').nullable().references('occurrences.id').onDelete('SET NULL');
    t.integer('proposal_id').nullable().references('proposals.id').onDelete('SET NULL');
    t.boolean('pinned').notNullable().defaultTo(false);
    t.boolean('locked').notNullable().defaultTo(false);
    t.string('created_at', 30).notNullable();
    t.string('last_activity_at', 30).notNullable();
    hiddenCols(t);
    t.index(['forum_id', 'last_activity_at']);
  });
  // comentários de propostas e respostas de tópicos; parent_id permite responder a um comentário
  await knex.schema.createTable('discussion_comments', (t) => {
    t.increments('id').primary();
    t.string('target_type', 10).notNullable().checkIn(['proposal', 'topic']);
    t.integer('target_id').notNullable();
    t.integer('parent_id').nullable().references('discussion_comments.id').onDelete('SET NULL');
    t.integer('author_id').notNullable().references('users.id').onDelete('CASCADE');
    t.text('body').notNullable();
    t.string('created_at', 30).notNullable();
    t.string('deleted_at', 30).nullable();
    t.integer('deleted_by').nullable().references('users.id').onDelete('SET NULL');
    hiddenCols(t);
    t.index(['target_type', 'target_id']);
  });
  await knex.schema.createTable('follows', (t) => {
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('target_type', 12).notNullable().checkIn(['proposal', 'topic']);
    t.integer('target_id').notNullable();
    t.string('created_at', 30).notNullable();
    t.primary(['user_id', 'target_type', 'target_id']);
    t.index(['target_type', 'target_id']);
  });
  // bairros de interesse: escolha privada, não revela endereço
  await knex.schema.createTable('user_neighborhoods', (t) => {
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.integer('neighborhood_id').notNullable().references('neighborhoods.id').onDelete('CASCADE');
    t.string('created_at', 30).notNullable();
    t.primary(['user_id', 'neighborhood_id']);
  });

  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('kind', 30).notNullable();
    t.string('title', 160).notNullable();
    t.string('body', 300).nullable();
    t.string('link', 200).notNullable();
    // avisos parecidos enquanto não lidos viram um só, com contador
    t.integer('count').notNullable().defaultTo(1);
    t.string('dedupe_key', 80).nullable();
    t.string('created_at', 30).notNullable();
    t.string('read_at', 30).nullable();
    t.index(['user_id', 'read_at']);
  });
  await knex.raw('CREATE UNIQUE INDEX notifications_uma_nao_lida ON notifications (user_id, dedupe_key) WHERE read_at IS NULL AND dedupe_key IS NOT NULL');

  await knex.schema.createTable('content_reports', (t) => {
    t.increments('id').primary();
    t.integer('reporter_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('target_type', 14).notNullable().checkIn(['post', 'post_comment', 'proposal', 'topic', 'comment']);
    t.integer('target_id').notNullable();
    t.string('reason', 20).notNullable().checkIn(['spam', 'ofensivo', 'odio', 'dados_pessoais', 'falso', 'fora_do_tema', 'outro']);
    t.string('details', 300).nullable();
    t.string('status', 14).notNullable().defaultTo('aberta').checkIn(['aberta', 'procedente', 'improcedente']);
    t.integer('resolved_by').nullable().references('users.id').onDelete('SET NULL');
    t.string('resolved_at', 30).nullable();
    t.string('resolution_note', 300).nullable();
    t.string('created_at', 30).notNullable();
    // uma denúncia por pessoa para cada conteúdo
    t.unique(['reporter_id', 'target_type', 'target_id']);
    t.index(['status']);
  });

  await knex.schema.createTable('settings', (t) => {
    t.string('key', 40).primary();
    t.text('value').notNullable();
    t.integer('updated_by').nullable().references('users.id').onDelete('SET NULL');
    t.string('updated_at', 30).notNullable();
  });
}

export async function down(knex: Knex) {
  for (const table of [
    'settings', 'content_reports', 'notifications', 'user_neighborhoods', 'follows', 'discussion_comments', 'topics', 'forums',
    'proposal_status_history', 'proposal_occurrences', 'proposal_votes', 'proposal_images', 'proposals', 'proposal_statuses',
    'resolution_feedback', 'occurrence_evidence', 'occurrence_resolutions', 'occurrence_info_requests', 'occurrence_events',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
  await knex.raw('DROP INDEX IF EXISTS occurrences_assigned_to_index');
  await knex.raw('DROP INDEX IF EXISTS occurrences_updated_at_index');
  // SQLite 3.35+ remove colunas sem chave estrangeira; as com referência ficam (são inofensivas e nulas)
  for (const col of ['priority', 'priority_reason', 'assigned_at', 'reopened_count', 'review_requested_at']) {
    await knex.raw(`ALTER TABLE occurrences DROP COLUMN ${col}`);
  }
  await knex.raw('ALTER TABLE statuses DROP COLUMN counts_as_resolved');
}
