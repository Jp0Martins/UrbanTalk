import { createRequire } from 'node:module';

// Usa o SQLite embutido no Node (node:sqlite), sem dependência nativa para compilar.
// O Knex não conhece esse driver, então reaproveitamos o cliente "better-sqlite3" dele
// trocando apenas o driver por um adaptador com a mesma interface.

const require = createRequire(import.meta.url);

// o node:sqlite ainda emite um aviso "experimental"; silenciamos só esse aviso
const previous = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  for (const l of previous) l(w);
});

const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type Param = null | number | bigint | string | Uint8Array;

class Statement {
  readonly reader: boolean;
  constructor(private st: import('node:sqlite').StatementSync, sql: string) {
    // columns() existe a partir do Node 22.16; antes disso, deduz pelo tipo de comando
    this.reader =
      typeof st.columns === 'function'
        ? st.columns().length > 0
        : /^\s*(select|pragma|with|explain|values)\b/i.test(sql) || /\breturning\b/i.test(sql);
  }
  all(bindings: Param[] = []) {
    return this.st.all(...bindings);
  }
  run(bindings: Param[] = []) {
    return this.st.run(...bindings);
  }
  safeIntegers() {
    return this;
  }
}

class Database {
  private db: import('node:sqlite').DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
  }
  prepare(sql: string) {
    return new Statement(this.db.prepare(sql), sql);
  }
  pragma(statement: string) {
    this.db.exec(`PRAGMA ${statement}`);
  }
  defaultSafeIntegers() {
    return this;
  }
  close() {
    this.db.close();
  }
}

const ClientBetterSQLite3 = require('knex/lib/dialects/better-sqlite3/index.js');

export class NodeSqliteClient extends ClientBetterSQLite3 {
  _driver() {
    return Database;
  }
}
Object.assign(NodeSqliteClient.prototype, { driverName: 'node:sqlite' });
