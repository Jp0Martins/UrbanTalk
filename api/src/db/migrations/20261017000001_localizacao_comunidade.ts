import type { Knex } from 'knex';

// cópia congelada das regras de normalização (migrações não importam código que pode mudar depois)
const placeName = (s: string) => s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
const placeKey = (s: string) =>
  placeName(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// localização em texto livre (abrangência cidade/bairro) e fóruns criados pela comunidade.
// occurrences, forums e content_reports são recriadas pelo procedimento oficial do SQLite
// (tabela nova, cópia, troca de nome) porque mudam restrições; nenhum dado existente é perdido.
export const config = { transaction: false };

// tema de cada fórum oficial, usado como categoria dos fóruns
const OFFICIAL_THEMES: Record<string, string> = {
  'mobilidade-urbana': 'mobilidade',
  'infraestrutura-ruas': 'infraestrutura',
  'iluminacao-publica': 'iluminacao',
  'meio-ambiente-limpeza': 'meio-ambiente',
  acessibilidade: 'acessibilidade',
  'seguranca-viaria': 'seguranca-viaria',
  'ideias-propostas': 'ideias',
  'duvidas-orientacoes': 'duvidas',
  'comunidade-bairros': 'comunidade',
};

export async function up(knex: Knex) {
  await knex.raw('PRAGMA foreign_keys = OFF');
  try {
    await knex.transaction(async (trx) => {
      // ocorrências: abrangência explícita, bairro digitado e ponto opcional quando é a cidade toda
      await trx.raw(`CREATE TABLE occurrences_new (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        category_id integer NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        scope varchar(10) NOT NULL DEFAULT 'bairro' CHECK (scope IN ('cidade','bairro')),
        neighborhood_name varchar(80) NULL,
        neighborhood_key varchar(80) NULL,
        street varchar(160) NULL,
        category_detail varchar(80) NULL,
        description text NOT NULL,
        reference varchar(120) NULL,
        latitude float NULL,
        longitude float NULL,
        photo_path varchar(80) NULL,
        status varchar(40) NOT NULL REFERENCES statuses(slug) ON DELETE RESTRICT ON UPDATE RESTRICT,
        idempotency_key varchar(64) NULL,
        is_demo boolean NOT NULL DEFAULT 0,
        created_at varchar(30) NOT NULL,
        updated_at varchar(30) NOT NULL,
        priority varchar(10) NULL CHECK (priority IN ('baixa','media','alta')),
        priority_reason varchar(300) NULL,
        assigned_to integer NULL REFERENCES users(id) ON DELETE SET NULL,
        assigned_at varchar(30) NULL,
        duplicate_of integer NULL REFERENCES occurrences(id) ON DELETE SET NULL,
        reopened_count integer NOT NULL DEFAULT 0,
        review_requested_at varchar(30) NULL,
        -- bairro só existe quando a abrangência é bairro; na cidade toda fica vazio
        CHECK ((scope = 'cidade' AND neighborhood_name IS NULL AND neighborhood_key IS NULL) OR (scope = 'bairro' AND neighborhood_name IS NOT NULL AND neighborhood_key IS NOT NULL)),
        -- ocorrência de bairro sempre tem ponto no mapa; da cidade toda pode não ter
        CHECK (scope = 'cidade' OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
        CHECK ((latitude IS NULL) = (longitude IS NULL))
      )`);
      await trx.raw(`INSERT INTO occurrences_new
        (id, user_id, category_id, scope, neighborhood_name, neighborhood_key, street, category_detail, description, reference, latitude, longitude, photo_path,
         status, idempotency_key, is_demo, created_at, updated_at, priority, priority_reason, assigned_to, assigned_at, duplicate_of, reopened_count, review_requested_at)
        SELECT o.id, o.user_id, o.category_id, 'bairro', n.name, lower(n.name), o.street, o.category_detail, o.description, o.reference, o.latitude, o.longitude, o.photo_path,
         o.status, o.idempotency_key, o.is_demo, o.created_at, o.updated_at, o.priority, o.priority_reason, o.assigned_to, o.assigned_at, o.duplicate_of, o.reopened_count, o.review_requested_at
        FROM occurrences o JOIN neighborhoods n ON n.id = o.neighborhood_id`);
      const before = Number((await trx('occurrences').count({ n: '*' }).first())?.n ?? 0);
      const copied = Number((await trx('occurrences_new').count({ n: '*' }).first())?.n ?? 0);
      if (before !== copied) throw new Error(`Migração interrompida: ${before} ocorrências, ${copied} copiadas.`);
      // a chave normalizada (sem acento) é calculada aqui, fora do SQL
      for (const r of (await trx('occurrences_new').whereNotNull('neighborhood_name').distinct('neighborhood_name')) as { neighborhood_name: string }[]) {
        await trx('occurrences_new').where({ neighborhood_name: r.neighborhood_name }).update({ neighborhood_name: placeName(r.neighborhood_name), neighborhood_key: placeKey(r.neighborhood_name) });
      }
      await trx.schema.dropTable('occurrences');
      await trx.schema.renameTable('occurrences_new', 'occurrences');
      for (const sql of [
        'CREATE INDEX occurrences_status_index ON occurrences (status)',
        'CREATE INDEX occurrences_category_id_index ON occurrences (category_id)',
        'CREATE INDEX occurrences_neighborhood_key_index ON occurrences (neighborhood_key)',
        'CREATE INDEX occurrences_scope_index ON occurrences (scope)',
        'CREATE INDEX occurrences_created_at_index ON occurrences (created_at)',
        'CREATE INDEX occurrences_updated_at_index ON occurrences (updated_at)',
        'CREATE INDEX occurrences_user_id_index ON occurrences (user_id)',
        'CREATE INDEX occurrences_street_index ON occurrences (street)',
        'CREATE INDEX occurrences_assigned_to_index ON occurrences (assigned_to)',
        'CREATE UNIQUE INDEX occurrences_user_id_idempotency_key_unique ON occurrences (user_id, idempotency_key)',
      ]) await trx.raw(sql);

      // propostas: bairro também em texto livre (vazio = cidade toda); a coluna antiga fica sem uso
      await trx.raw('ALTER TABLE proposals ADD COLUMN neighborhood_name varchar(80) NULL');
      await trx.raw('ALTER TABLE proposals ADD COLUMN neighborhood_key varchar(80) NULL');
      for (const p of (await trx('proposals as p').join('neighborhoods as n', 'n.id', 'p.neighborhood_id').select('p.id', 'n.name')) as { id: number; name: string }[]) {
        await trx('proposals').where({ id: p.id }).update({ neighborhood_name: placeName(p.name), neighborhood_key: placeKey(p.name), neighborhood_id: null });
      }
      await trx.raw('CREATE INDEX proposals_neighborhood_key_index ON proposals (neighborhood_key)');

      // fóruns: oficiais (os temáticos de antes) e da comunidade; grupos automáticos de bairro deixam de existir
      await trx.raw(`CREATE TABLE forums_new (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        slug varchar(60) NOT NULL UNIQUE,
        name varchar(80) NOT NULL,
        name_key varchar(80) NOT NULL,
        description varchar(300) NOT NULL DEFAULT '',
        kind varchar(12) NOT NULL CHECK (kind IN ('oficial','comunidade')),
        theme varchar(30) NOT NULL DEFAULT 'comunidade',
        tags varchar(200) NOT NULL DEFAULT '',
        neighborhood_name varchar(80) NULL,
        neighborhood_key varchar(80) NULL,
        rules text NOT NULL DEFAULT '',
        icon varchar(40) NOT NULL DEFAULT 'chat',
        sort_order integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT 1,
        status varchar(12) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pendente','recusado')),
        created_by integer NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at varchar(30) NOT NULL,
        updated_at varchar(30) NOT NULL,
        hidden_at varchar(30) NULL,
        hidden_by integer NULL REFERENCES users(id) ON DELETE SET NULL,
        hidden_reason varchar(40) NULL
      )`);
      const forums = (await trx('forums').select()) as Record<string, any>[];
      const withTopics = new Set(((await trx('topics').distinct('forum_id')) as { forum_id: number }[]).map((r) => r.forum_id));
      for (const f of forums) {
        if (f.kind === 'bairro' && !withTopics.has(f.id)) continue;
        const official = f.kind === 'tema';
        await trx('forums_new').insert({
          id: f.id,
          slug: f.slug,
          name: f.name,
          name_key: placeKey(f.name),
          description: f.description ?? '',
          kind: official ? 'oficial' : 'comunidade',
          theme: OFFICIAL_THEMES[f.slug] ?? 'comunidade',
          tags: official ? '' : 'bairro',
          // grupo de bairro com conversas vira fórum comum que menciona o bairro
          neighborhood_name: official ? null : placeName(f.name),
          neighborhood_key: official ? null : placeKey(f.name),
          rules: '',
          icon: official ? f.icon : 'pin',
          sort_order: official ? f.sort_order : 0,
          active: f.active,
          status: 'ativo',
          created_by: null,
          created_at: f.created_at,
          updated_at: f.created_at,
        });
      }
      await trx.schema.dropTable('forums');
      await trx.schema.renameTable('forums_new', 'forums');
      await trx.raw('CREATE INDEX forums_name_key_index ON forums (name_key)');
      await trx.raw('CREATE INDEX forums_neighborhood_key_index ON forums (neighborhood_key)');

      // discussões ganham tags; votos "útil" em discussões e comentários, um por pessoa
      await trx.raw("ALTER TABLE topics ADD COLUMN tags varchar(200) NOT NULL DEFAULT ''");
      await trx.schema.createTable('topic_votes', (t) => {
        t.integer('topic_id').notNullable().references('topics.id').onDelete('CASCADE');
        t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
        t.string('created_at', 30).notNullable();
        t.primary(['topic_id', 'user_id']);
      });
      await trx.schema.createTable('comment_votes', (t) => {
        t.integer('comment_id').notNullable().references('discussion_comments.id').onDelete('CASCADE');
        t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
        t.string('created_at', 30).notNullable();
        t.primary(['comment_id', 'user_id']);
      });
      await trx.schema.createTable('forum_follows', (t) => {
        t.integer('forum_id').notNullable().references('forums.id').onDelete('CASCADE');
        t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
        t.string('created_at', 30).notNullable();
        t.primary(['forum_id', 'user_id']);
      });

      // bairros de interesse em texto livre
      await trx.schema.createTable('user_places', (t) => {
        t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
        t.string('place_key', 80).notNullable();
        t.string('place_name', 80).notNullable();
        t.string('created_at', 30).notNullable();
        t.primary(['user_id', 'place_key']);
      });
      for (const r of (await trx('user_neighborhoods as u').join('neighborhoods as n', 'n.id', 'u.neighborhood_id').select('u.user_id', 'n.name', 'u.created_at')) as Record<string, any>[]) {
        await trx('user_places').insert({ user_id: r.user_id, place_key: placeKey(r.name), place_name: placeName(r.name), created_at: r.created_at }).onConflict(['user_id', 'place_key']).ignore();
      }
      await trx.schema.dropTable('user_neighborhoods');

      // denúncias passam a aceitar fóruns
      await trx.raw(`CREATE TABLE content_reports_new (
        id integer NOT NULL PRIMARY KEY AUTOINCREMENT,
        reporter_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type varchar(14) NOT NULL CHECK (target_type IN ('post','post_comment','proposal','topic','comment','forum')),
        target_id integer NOT NULL,
        reason varchar(20) NOT NULL CHECK (reason IN ('spam','ofensivo','odio','dados_pessoais','falso','fora_do_tema','outro')),
        details varchar(300) NULL,
        status varchar(14) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','procedente','improcedente')),
        resolved_by integer NULL REFERENCES users(id) ON DELETE SET NULL,
        resolved_at varchar(30) NULL,
        resolution_note varchar(300) NULL,
        created_at varchar(30) NOT NULL
      )`);
      await trx.raw('INSERT INTO content_reports_new SELECT id, reporter_id, target_type, target_id, reason, details, status, resolved_by, resolved_at, resolution_note, created_at FROM content_reports');
      await trx.schema.dropTable('content_reports');
      await trx.schema.renameTable('content_reports_new', 'content_reports');
      await trx.raw('CREATE UNIQUE INDEX content_reports_reporter_id_target_type_target_id_unique ON content_reports (reporter_id, target_type, target_id)');
      await trx.raw('CREATE INDEX content_reports_status_index ON content_reports (status)');

      const broken = await trx.raw('PRAGMA foreign_key_check');
      if (Array.isArray(broken) && broken.length > 0) {
        throw new Error(`Migração interrompida: ${broken.length} referências inválidas encontradas.`);
      }
    });
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

// voltar exigiria escolher um bairro da lista antiga para cada nome digitado e recriar grupos automáticos
export async function down() {
  throw new Error('Esta migração não pode ser desfeita automaticamente: restaure o backup do banco feito antes da atualização.');
}
