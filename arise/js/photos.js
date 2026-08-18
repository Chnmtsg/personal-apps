/* Discipline — exercise pictures.

   A picture of how a movement is done, one per exercise, stored on the device
   and nowhere else. The app still makes no network calls: every image here is
   one the user picked from their own phone.

   WHY THIS IS NOT IN `arise.state.v1`
   The whole of `state` is one JSON string in localStorage, rewritten on every
   commit. A few dozen photos is several megabytes, localStorage gives an origin
   about five, and going over throws on *write* — which would mean a photo the
   user added quietly costing them every goal, log and journal entry from that
   moment on. That is the one failure this app has no recovery from, so pictures
   live in their own IndexedDB store where they cannot reach the ledger. A photo
   that fails to save is a photo that fails to save.

   Reads are async and renders are not, so every picture is held in a memory
   cache filled once at boot. `get` is synchronous against that cache; the
   database is only ever touched by `load`, `put` and `remove`.

   Degrades to nothing. Private mode, a browser with IndexedDB disabled, or the
   test sandboxes have no database — `ready()` resolves, `get` returns null, and
   every screen renders exactly as it did before pictures existed. */
(function (root) {
  'use strict';

  const A = root.Arise;
  const DB_NAME = 'discipline.photos';
  const STORE = 'photos';
  const DB_VERSION = 1;

  /* id → data URL. The only thing the render path reads. */
  const cache = {};
  let db = null;
  let opened = null;

  const supported = () => {
    try {
      return !!root.indexedDB;
    } catch (err) {
      return false;   // some privacy modes throw on the property itself
    }
  };

  function open() {
    if (opened) return opened;
    opened = new Promise((resolve) => {
      if (!supported()) return resolve(null);
      let req;
      try {
        req = root.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        return resolve(null);
      }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return opened;
  }

  function tx(mode, fn) {
    return open().then((d) => {
      if (!d) return null;
      return new Promise((resolve) => {
        let t;
        try {
          t = d.transaction(STORE, mode);
        } catch (err) {
          return resolve(null);
        }
        const req = fn(t.objectStore(STORE));
        t.onabort = () => resolve(null);
        t.onerror = () => resolve(null);
        if (!req) { t.oncomplete = () => resolve(true); return; }
        req.onsuccess = () => resolve(req.result === undefined ? true : req.result);
        req.onerror = () => resolve(null);
      });
    });
  }

  /**
   * Fill the cache. Called once at boot, before the first render.
   *
   * Never rejects. A device that cannot give us the pictures still has to give
   * the user their app.
   */
  function load() {
    return open()
      .then((d) => {
        if (!d) return cache;
        return new Promise((resolve) => {
          let t;
          try {
            t = d.transaction(STORE, 'readonly');
          } catch (err) {
            return resolve(cache);
          }
          const req = t.objectStore(STORE).openCursor();
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) return resolve(cache);
            if (typeof cur.value === 'string') cache[cur.key] = cur.value;
            cur.continue();
          };
          req.onerror = () => resolve(cache);
          t.onerror = () => resolve(cache);
          t.onabort = () => resolve(cache);
        });
      })
      .catch(() => cache);
  }

  /** The picture for this exercise, or null. Synchronous, for the render path. */
  function get(id) {
    return Object.prototype.hasOwnProperty.call(cache, id) ? cache[id] : null;
  }

  const has = (id) => get(id) != null;

  /**
   * Save a picture against an exercise.
   *
   * The cache is written first so the next render shows it, and the database
   * write is what can fail. It resolves false when the picture did not persist,
   * which the caller has to say out loud — a photo that vanishes on reload with
   * no warning is worse than one that was refused.
   */
  function put(id, dataUrl) {
    if (!id || typeof dataUrl !== 'string' || !dataUrl) return Promise.resolve(false);
    cache[id] = dataUrl;
    return tx('readwrite', (s) => s.put(dataUrl, id))
      .then((ok) => ok !== null)
      .catch(() => false);
  }

  function remove(id) {
    delete cache[id];
    /* `tx` resolves null when the transaction aborts or errors, so mapping it
       straight to `true` reported a delete that never landed — and the picture
       came back on the next `load()` while the toast said it was gone. `put`
       already gets this right; this now matches it. */
    return tx('readwrite', (s) => s.delete(id))
      .then((ok) => ok !== null)
      .catch(() => false);
  }

  /** Every picture, for the backup file. */
  function all() {
    const out = {};
    Object.keys(cache).forEach((k) => { out[k] = cache[k]; });
    return out;
  }

  /**
   * Restore from a backup. Additive: a backup without pictures removes none.
   *
   * The cache is filled synchronously, exactly as `put` does, so the very next
   * render draws the restored pictures rather than waiting on a chain of
   * database writes. It then resolves with how many actually PERSISTED — it
   * used to resolve `ids.length` regardless, so a device that stored none still
   * reported "restored, with 7 pictures", which is the one path where being
   * wrong costs the user the pictures they came to recover.
   */
  function restore(map) {
    if (!map || typeof map !== 'object') return Promise.resolve(0);
    const ids = Object.keys(map).filter((k) => typeof map[k] === 'string' && map[k]);
    ids.forEach((id) => { cache[id] = map[id]; });
    let stored = 0;
    return ids
      .reduce(
        (chain, id) => chain.then(() =>
          tx('readwrite', (s) => s.put(map[id], id)).then((ok) => { if (ok !== null) stored++; })),
        Promise.resolve()
      )
      .then(() => stored)
      .catch(() => stored);
  }

  /**
   * Shrink a picked image to something worth storing.
   *
   * Phone cameras produce 3–8MB files and this is drawn at about 340px wide, so
   * the original is thrown away deliberately: it would cost a hundred times the
   * space for detail no screen here will ever show. JPEG rather than PNG for the
   * same reason — these are photographs and diagrams, not icons.
   *
   * Resolves null rather than rejecting when the file is not a readable image.
   */
  function shrink(file, maxWidth, quality) {
    const cap = maxWidth || 720;
    const q = quality || 0.72;
    return new Promise((resolve) => {
      if (!file || !root.FileReader || !root.Image) return resolve(null);
      const reader = new root.FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const img = new root.Image();
        img.onerror = () => resolve(null);
        img.onload = () => {
          try {
            const scale = Math.min(1, cap / (img.width || cap));
            const w = Math.max(1, Math.round((img.width || cap) * scale));
            const h = Math.max(1, Math.round((img.height || cap) * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            /* The reference pictures are line art on white. Painting white
               underneath keeps a transparent PNG from turning black the moment
               it is flattened into a JPEG. */
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            const url = canvas.toDataURL('image/jpeg', q);
            resolve(typeof url === 'string' && url.indexOf('data:image') === 0 ? url : null);
          } catch (err) {
            resolve(null);
          }
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  A.Photos = {
    supported, load, get, has, put, remove, all, restore, shrink,
    /** Roughly what the pictures cost on disk, for the line in More. */
    bytes: () => Object.keys(cache).reduce((n, k) => n + cache[k].length, 0),
    count: () => Object.keys(cache).length
  };
})(window);
