import type { Knex } from 'knex';

// perfis (cliente/funcionário), status configuráveis, rua, "Outros", anotações, feed social e auditoria.
// o SQLite não altera CHECK nem chave estrangeira de coluna existente, então users e occurrences
// são recriadas pelo procedimento oficial (tabela nova, cópia, troca de nome) com as chaves desligadas.
// por isso esta migração roda fora da transação automática e abre a sua própria.
export const config = { transaction: false };

const now = () => new Date().toISOString();

export async function up(knex: Knex) {
  await knex.raw('PRAGMA foreign_keys = OFF');
  try {
    await knex.transaction(async (trx) => {
      // status configuráveis; slug é fixo depois de criado para o histórico continuar legível
      await trx.schema.createTable('statuses', (t) => {
        t.increments('id').primary();
        t.string('slug', 40).notNullable().unique();
        t.string('name', 40).notNullable().unique();
        t.string('description', 240).notNullable().defaultTo('');
        t.string('color', 16).notNullable().defaultTo('cinza');
        // encerrado: a ocorrência saiu da fila (resolvida, não procedente, cancelada...)
        t.boolean('is_closed').notNullable().defaultTo(false);
        t.boolean('is_initial').notNullable().defaultTo(false);
        t.boolean('active').notNullable().defaultTo(true);
        t.integer('sort_order').notNullable().defaultTo(0);
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
      });
      // só um status pode ser o inicial
      await trx.raw('CREATE UNIQUE INDEX statuses_um_inicial ON statuses (is_initial) WHERE is_initial = 1');
      const ts = now();
      await trx('statuses').insert([
        { slug: 'registrada', name: 'Registrada', description: 'Recebida pelo UrbanTalk e visível no mapa. Ainda não foi incluída em um relatório.', color: 'ambar', is_closed: false, is_initial: true, active: true, sort_order: 10, created_at: ts, updated_at: ts },
        { slug: 'encaminhada', name: 'Encaminhada', description: 'Incluída em um relatório que a equipe enviou manualmente ao órgão responsável.', color: 'azul', is_closed: false, is_initial: false, active: true, sort_order: 50, created_at: ts, updated_at: ts },
        { slug: 'resolvida', name: 'Resolvida', description: 'A equipe conferiu que o problema foi solucionado.', color: 'verde', is_closed: true, is_initial: false, active: true, sort_order: 90, created_at: ts, updated_at: ts },
      ]);

      // users: novo papel "staff" (funcionário); "admin" continua sendo funcionário com gestão
      await trx.schema.createTable('users_new', (t) => {
        t.increments('id').primary();
        t.string('name', 120).notNullable();
        t.string('email', 254).notNullable().unique();
        t.string('password_hash', 255).notNullable();
        t.string('role', 16).notNullable().defaultTo('user').checkIn(['user', 'staff', 'admin']);
        t.string('created_at', 30).notNullable();
      });
      await trx.raw('INSERT INTO users_new (id, name, email, password_hash, role, created_at) SELECT id, name, email, password_hash, role, created_at FROM users');
      await trx.schema.dropTable('users');
      await trx.schema.renameTable('users_new', 'users');

      // occurrences: status passa a apontar para a tabela statuses; entram rua, detalhe de "Outros" e chave anti-duplicidade
      await trx.schema.createTable('occurrences_new', (t) => {
        t.increments('id').primary();
        t.integer('user_id').notNullable().references('users.id').onDelete('RESTRICT');
        t.integer('category_id').notNullable().references('categories.id').onDelete('RESTRICT');
        t.integer('neighborhood_id').notNullable().references('neighborhoods.id').onDelete('RESTRICT');
        t.string('street', 160).nullable();
        t.string('category_detail', 80).nullable();
        t.text('description').notNullable();
        t.string('reference', 120).nullable();
        t.double('latitude').notNullable();
        t.double('longitude').notNullable();
        t.string('photo_path', 80).nullable();
        t.string('status', 40).notNullable().references('statuses.slug').onDelete('RESTRICT').onUpdate('RESTRICT');
        t.string('idempotency_key', 64).nullable();
        t.boolean('is_demo').notNullable().defaultTo(false);
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
      });
      await trx.raw(`INSERT INTO occurrences_new
        (id, user_id, category_id, neighborhood_id, street, category_detail, description, reference, latitude, longitude, photo_path, status, idempotency_key, is_demo, created_at, updated_at)
        SELECT id, user_id, category_id, neighborhood_id, NULL, NULL, description, reference, latitude, longitude, photo_path, status, NULL, is_demo, created_at, updated_at FROM occurrences`);
      await trx.schema.dropTable('occurrences');
      await trx.schema.renameTable('occurrences_new', 'occurrences');
      await trx.schema.alterTable('occurrences', (t) => {
        t.index(['status']);
        t.index(['category_id']);
        t.index(['neighborhood_id']);
        t.index(['created_at']);
        t.index(['user_id']);
        t.index(['street']);
        // mesmo envio repetido (clique duplo, nova tentativa após queda) não cria outra ocorrência
        t.unique(['user_id', 'idempotency_key']);
      });

      // "Outros": categorias que exigem especificação do problema
      await trx.schema.alterTable('categories', (t) => {
        t.boolean('requires_detail').notNullable().defaultTo(false);
      });

      // anotações da equipe: internas (só funcionários) ou públicas (acompanhamento do cidadão)
      await trx.schema.createTable('occurrence_notes', (t) => {
        t.increments('id').primary();
        t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
        t.integer('author_id').notNullable().references('users.id').onDelete('RESTRICT');
        t.string('visibility', 10).notNullable().checkIn(['interna', 'publica']);
        t.text('body').notNullable();
        t.string('created_at', 30).notNullable();
        t.index(['occurrence_id', 'visibility']);
      });

      // feed da comunidade
      await trx.schema.createTable('posts', (t) => {
        t.increments('id').primary();
        t.integer('author_id').notNullable().references('users.id').onDelete('CASCADE');
        t.integer('occurrence_id').nullable().references('occurrences.id').onDelete('SET NULL');
        t.text('body').notNullable();
        t.string('created_at', 30).notNullable();
        t.string('deleted_at', 30).nullable();
        t.integer('deleted_by').nullable().references('users.id').onDelete('SET NULL');
        t.index(['created_at']);
        t.index(['occurrence_id']);
        t.index(['author_id']);
      });
      await trx.schema.createTable('post_comments', (t) => {
        t.increments('id').primary();
        t.integer('post_id').notNullable().references('posts.id').onDelete('CASCADE');
        t.integer('author_id').notNullable().references('users.id').onDelete('CASCADE');
        t.text('body').notNullable();
        t.string('created_at', 30).notNullable();
        t.string('deleted_at', 30).nullable();
        t.integer('deleted_by').nullable().references('users.id').onDelete('SET NULL');
        t.index(['post_id']);
      });
      await trx.schema.createTable('post_likes', (t) => {
        t.integer('post_id').notNullable().references('posts.id').onDelete('CASCADE');
        t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
        t.string('created_at', 30).notNullable();
        // uma curtida por pessoa por publicação, garantido pelo banco
        t.primary(['post_id', 'user_id']);
      });

      // registro das ações administrativas relevantes
      await trx.schema.createTable('audit_log', (t) => {
        t.increments('id').primary();
        t.integer('actor_id').nullable().references('users.id').onDelete('SET NULL');
        t.string('action', 40).notNullable();
        t.string('target_type', 20).notNullable();
        t.integer('target_id').nullable();
        t.text('details').nullable();
        t.string('created_at', 30).notNullable();
        t.index(['target_type', 'target_id']);
      });

      // nenhuma referência pode ter ficado quebrada na troca de tabelas
      const broken = await trx.raw('PRAGMA foreign_key_check');
      if (Array.isArray(broken) && broken.length > 0) {
        throw new Error(`Migração interrompida: ${broken.length} referências inválidas encontradas.`);
      }
    });
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}

export async function down(knex: Knex) {
  await knex.raw('PRAGMA foreign_keys = OFF');
  try {
    await knex.transaction(async (trx) => {
      await trx.schema.dropTableIfExists('audit_log');
      await trx.schema.dropTableIfExists('post_likes');
      await trx.schema.dropTableIfExists('post_comments');
      await trx.schema.dropTableIfExists('posts');
      await trx.schema.dropTableIfExists('occurrence_notes');
      await trx.schema.alterTable('categories', (t) => t.dropColumn('requires_detail'));
      await trx('categories').where({ slug: 'outros' }).whereNotExists(trx('occurrences').whereRaw('occurrences.category_id = categories.id')).delete();

      // volta ao formato antigo; status fora dos três originais viram "registrada"
      await trx.schema.createTable('occurrences_old', (t) => {
        t.increments('id').primary();
        t.integer('user_id').notNullable().references('users.id').onDelete('RESTRICT');
        t.integer('category_id').notNullable().references('categories.id').onDelete('RESTRICT');
        t.integer('neighborhood_id').notNullable().references('neighborhoods.id').onDelete('RESTRICT');
        t.text('description').notNullable();
        t.string('reference', 120).nullable();
        t.double('latitude').notNullable();
        t.double('longitude').notNullable();
        t.string('photo_path', 80).nullable();
        t.string('status', 16).notNullable().defaultTo('registrada').checkIn(['registrada', 'encaminhada', 'resolvida']);
        t.boolean('is_demo').notNullable().defaultTo(false);
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
      });
      await trx.raw(`INSERT INTO occurrences_old SELECT id, user_id, category_id, neighborhood_id, description, reference, latitude, longitude, photo_path,
        CASE WHEN status IN ('registrada','encaminhada','resolvida') THEN status ELSE 'registrada' END, is_demo, created_at, updated_at FROM occurrences`);
      await trx.schema.dropTable('occurrences');
      await trx.schema.renameTable('occurrences_old', 'occurrences');
      await trx.schema.alterTable('occurrences', (t) => {
        t.index(['status']);
        t.index(['category_id']);
        t.index(['neighborhood_id']);
        t.index(['created_at']);
        t.index(['user_id']);
      });

      await trx.schema.createTable('users_old', (t) => {
        t.increments('id').primary();
        t.string('name', 120).notNullable();
        t.string('email', 254).notNullable().unique();
        t.string('password_hash', 255).notNullable();
        t.string('role', 16).notNullable().defaultTo('user').checkIn(['user', 'admin']);
        t.string('created_at', 30).notNullable();
      });
      await trx.raw(`INSERT INTO users_old SELECT id, name, email, password_hash, CASE WHEN role = 'staff' THEN 'admin' ELSE role END, created_at FROM users`);
      await trx.schema.dropTable('users');
      await trx.schema.renameTable('users_old', 'users');
      await trx.schema.dropTable('statuses');
    });
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }
}
