import type { Knex } from 'knex';

export async function up(knex: Knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name', 120).notNullable();
    t.string('email', 254).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('role', 16).notNullable().defaultTo('user').checkIn(['user', 'admin']);
    t.string('created_at', 30).notNullable();
  });

  await knex.schema.createTable('categories', (t) => {
    t.increments('id').primary();
    t.string('slug', 40).notNullable().unique();
    t.string('name', 80).notNullable();
    t.string('description', 200).notNullable();
    t.string('icon', 40).notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('neighborhoods', (t) => {
    t.increments('id').primary();
    t.string('name', 80).notNullable().unique();
  });

  await knex.schema.createTable('occurrences', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('users.id').onDelete('RESTRICT');
    t.integer('category_id').notNullable().references('categories.id').onDelete('RESTRICT');
    t.integer('neighborhood_id').notNullable().references('neighborhoods.id').onDelete('RESTRICT');
    t.text('description').notNullable();
    t.string('reference', 120).nullable();
    t.double('latitude').notNullable();
    t.double('longitude').notNullable();
    t.string('photo_path', 80).nullable();
    t.string('status', 16)
      .notNullable()
      .defaultTo('registrada')
      .checkIn(['registrada', 'encaminhada', 'resolvida']);
    t.boolean('is_demo').notNullable().defaultTo(false);
    t.string('created_at', 30).notNullable();
    t.string('updated_at', 30).notNullable();
    t.index(['status']);
    t.index(['category_id']);
    t.index(['neighborhood_id']);
    t.index(['created_at']);
    t.index(['user_id']);
  });

  await knex.schema.createTable('confirmations', (t) => {
    t.increments('id').primary();
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('created_at', 30).notNullable();
    // uma confirmação por pessoa por ocorrência, garantido pelo banco
    t.unique(['occurrence_id', 'user_id']);
  });

  await knex.schema.createTable('status_history', (t) => {
    t.increments('id').primary();
    t.integer('occurrence_id').notNullable().references('occurrences.id').onDelete('CASCADE');
    t.string('from_status', 16).nullable();
    t.string('to_status', 16).notNullable();
    t.integer('changed_by').nullable().references('users.id').onDelete('SET NULL');
    t.string('note', 500).nullable();
    t.string('created_at', 30).notNullable();
    t.index(['occurrence_id']);
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('status_history');
  await knex.schema.dropTableIfExists('confirmations');
  await knex.schema.dropTableIfExists('occurrences');
  await knex.schema.dropTableIfExists('neighborhoods');
  await knex.schema.dropTableIfExists('categories');
  await knex.schema.dropTableIfExists('users');
}
