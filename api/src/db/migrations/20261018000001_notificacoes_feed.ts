import type { Knex } from 'knex';

// avisos de curtida do feed: guarda quem já gerou aviso para cada publicação,
// assim curtir, descurtir e curtir de novo não manda outro aviso ao autor. só acrescenta uma tabela.

export async function up(knex: Knex) {
  await knex.schema.createTable('post_like_notices', (t) => {
    t.integer('post_id').notNullable().references('posts.id').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('created_at', 30).notNullable();
    t.primary(['post_id', 'user_id']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('post_like_notices');
}
