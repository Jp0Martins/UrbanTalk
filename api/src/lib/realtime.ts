import { EventEmitter } from 'node:events';
import type { Knex } from 'knex';

// avisos em tempo real dentro deste processo: cada conexão aberta (SSE) escuta só o próprio usuário
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function onUserChange(userId: number, fn: () => void) {
  bus.on(`u${userId}`, fn);
  return () => {
    bus.off(`u${userId}`, fn);
  };
}

export function emitUserChange(userIds: Iterable<number>) {
  for (const id of new Set(userIds)) bus.emit(`u${id}`);
}

// dentro de uma transação, só avisa depois do commit (senão o navegador leria o banco antigo)
export function emitAfterCommit(db: Knex, userIds: Iterable<number>) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const trx = db as Knex.Transaction;
  if (trx.isTransaction && trx.executionPromise) {
    trx.executionPromise.then(
      () => emitUserChange(ids),
      () => undefined,
    );
  } else {
    emitUserChange(ids);
  }
}
