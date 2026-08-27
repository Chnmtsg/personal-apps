/**
 * IndexedDB, wrapped in promises.
 *
 * This file knows about object stores and nothing about goals. Every domain
 * rule lives a layer up in store.js, so that swapping the engine underneath —
 * or faking it in a test — touches only this file.
 *
 * IndexedDB rather than localStorage because check-ins grow without bound and
 * a five-megabyte string that must be reparsed on every read is not a store.
 */

export const DB_NAME = 'where-am-i';
export const DB_VERSION = 1;
export const STORES = ['goals', 'indicators', 'checkIns'];

let connection = null;
let opening = null;

/**
 * Schema migrations, applied in order for any upgrade from an older version.
 * Adding version 2 means adding a case here and never editing case 1 — an
 * installed browser replays only the steps it has not seen.
 */
function migrate(db, oldVersion) {
  if (oldVersion < 1) {
    db.createObjectStore('goals', { keyPath: 'id' });

    const indicators = db.createObjectStore('indicators', { keyPath: 'id' });
    indicators.createIndex('goalId', 'goalId', { unique: false });

    const checkIns = db.createObjectStore('checkIns', { keyPath: 'id' });
    checkIns.createIndex('indicatorId', 'indicatorId', { unique: false });
    checkIns.createIndex('date', 'date', { unique: false });
  }
}

/**
 * One connection, shared.
 *
 * The in-flight promise is memoised, not just the finished connection: the app
 * opens by loading three stores at once, and without this each of those would
 * open its own connection and leak two of them. A leaked connection blocks the
 * next version upgrade, which is a hang with no error message.
 */
export function open() {
  if (connection) return Promise.resolve(connection);
  if (opening) return opening;

  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion);
    request.onsuccess = () => {
      connection = request.result;
      // A second tab opening a newer version must not be blocked by this one.
      connection.onversionchange = () => close();
      resolve(connection);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Another tab is holding an older version of the database open.'));
  }).finally(() => { opening = null; });

  return opening;
}

export function close() {
  connection?.close();
  connection = null;
  opening = null;
}

async function run(storeNames, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted.'));
    // The work is synchronous on purpose: an await inside an IndexedDB
    // transaction lets it auto-commit mid-way, which is the classic way to
    // half-write a goal.
    result = work(...storeNames.map((name) => tx.objectStore(name)), tx);
  });
}

const ask = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function read(storeNames, work) {
  return run(storeNames, 'readonly', work);
}

export function write(storeNames, work) {
  return run(storeNames, 'readwrite', work);
}

export async function getAll(storeName) {
  return read([storeName], (store) => ask(store.getAll()));
}



export async function put(storeName, record) {
  await write([storeName], (store) => store.put(record));
  return record;
}


/** Used by import, which replaces everything rather than merging. */
export async function replaceAll(contents) {
  await write(STORES, (goals, indicators, checkIns) => {
    const stores = { goals, indicators, checkIns };
    for (const name of STORES) {
      stores[name].clear();
      for (const record of contents[name] ?? []) stores[name].put(record);
    }
  });
}
