// src/utils/dataModel.js
/* =====================================================================================
   Swing Sync • Data Model — Versioned IndexedDB with Legacy Migration
   -------------------------------------------------------------------------------------
   PURPOSE:
   - Keep clip storage stable across browser engines and app revisions.
   - Store BOTH Blob and raw bytes (ArrayBuffer) with mime 'type'.
   - Versioned primary DB + one-time migration from legacy DB.

   PUBLIC API (stable):
     • ensureWebmType(blob) => Blob
     • savePitchClip(videoKey, blob) => Promise<void>
     • getPitchClipBlob(videoKey) => Promise<Blob|null>
     • deletePitchClip(videoKey) => Promise<boolean>
     • hasPitchClip(videoKey) => Promise<boolean>
     • listPitchClipKeys() => Promise<string[]>
     • createHitter(name) => { name, swings: [] }            // back-compat
     • createPitcher(name) => { name, pitches: [] }          // back-compat
     • findHitter(hitters, name) => object|undefined
     • findPitcher(pitchers, name) => object|undefined
   ===================================================================================== */

/* ================================= BEGIN: DB Constants ============================== */
export const DB_NAME = "SwingSyncPitchDB";
export const DB_VERSION = 4; // bump when schema of primary DB changes
export const STORE_PITCH_CLIPS = "pitchClips"; // { key, blob?, bytes?, type, createdAt, _recVer }
export const STORE_META = "meta";               // { key:'legacyMigratedV1', value:true, migratedAt:number }

const RECORD_VERSION = 1; // version for pitchClips records

// Legacy source (read-only migration)
const LEGACY_DB_NAME = "SwingSyncDB";
const LEGACY_STORE_NAME = "pitchClips";
/* ================================== END: DB Constants ============================== */

/* =============================== BEGIN: Utilities ================================== */
/** Ensure a Blob has a video/* type; default to video/webm if missing. */
export function ensureWebmType(blob) {
  if (!(blob instanceof Blob)) return null;
  if (blob.type && blob.type.startsWith("video/")) return blob;
  try { return new Blob([blob], { type: "video/webm" }); } catch { return blob; }
}

/** Build a video Blob from raw bytes + type. */
function blobFromBytes(bytes, type = "video/webm") {
  try { return new Blob([bytes], { type: type || "video/webm" }); } catch { return null; }
}
/* ================================ END: Utilities =================================== */

/* ============================ BEGIN: Primary DB Open =============================== */
/**
 * openPitchDB — opens/creates the primary DB. Creates stores on upgrade.
 * SCHEMA:
 *   v4: pitchClips(keyPath 'key') + meta(keyPath 'key')
 */
function openPitchDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Create/upgrade stores idempotently
      if (!db.objectStoreNames.contains(STORE_PITCH_CLIPS)) {
        const s = db.createObjectStore(STORE_PITCH_CLIPS, { keyPath: "key" });
        s.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
/* ============================= END: Primary DB Open ================================ */

/* ============================ BEGIN: Legacy DB Open ================================= */
/** Open legacy DB if present (read-only). */
function openLegacyDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open(LEGACY_DB_NAME);
    req.onupgradeneeded = () => {
      // Don’t initialize legacy schema on new installs.
      req.transaction.abort();
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        db.close();
        resolve(null);
      } else {
        resolve(db);
      }
    };
    req.onerror = () => resolve(null);
  });
}
/* ============================= END: Legacy DB Open ================================== */

/* ========================= BEGIN: One-Time Legacy Migration ========================= */
let MIGRATED_THIS_SESSION = false;

/** read meta flag */
async function getMetaFlag(db, key) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_META, "readonly");
      const st = tx.objectStore(STORE_META);
      const req = st.get(String(key));
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

/** set meta flag */
async function putMetaFlag(db, key, valueObj) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_META, "readwrite");
      const st = tx.objectStore(STORE_META);
      st.put({ key: String(key), ...valueObj });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("meta tx aborted"));
    } catch (e) { reject(e); }
  });
}

/**
 * ensureLegacyMigratedOnce — Copies legacy records into primary DB a single time.
 * Writes both blob and bytes (rebuilt when missing), stamps meta flag.
 */
async function ensureLegacyMigratedOnce() {
  if (MIGRATED_THIS_SESSION) return;
  const db = await openPitchDB();
  try {
    const already = await getMetaFlag(db, "legacyMigratedV1");
    if (already) { MIGRATED_THIS_SESSION = true; return; }

    const legacy = await openLegacyDB();
    if (!legacy) {
      await putMetaFlag(db, "legacyMigratedV1", { value: true, migratedAt: Date.now() });
      MIGRATED_THIS_SESSION = true;
      return;
    }

    // Pull all legacy records
    const legacyRecords = await new Promise((resolve, reject) => {
      const out = [];
      try {
        const tx = legacy.transaction(LEGACY_STORE_NAME, "readonly");
        const st = tx.objectStore(LEGACY_STORE_NAME);
        const cursor = st.openCursor();
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { out.push(c.value); c.continue(); }
          else resolve(out);
        };
        cursor.onerror = () => reject(cursor.error);
      } catch (e) { reject(e); }
    });

    // Write into primary store
    await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
        const st = tx.objectStore(STORE_PITCH_CLIPS);
        for (const rec of legacyRecords) {
          const key = String(rec.key);
          const blob = rec.blob instanceof Blob ? rec.blob : null;
          const type = (rec.type && String(rec.type)) || (blob?.type || "video/webm");
          const bytes = rec.bytes || null;
          const createdAt = Number(rec.createdAt) || Date.now();

          // Prefer original blob; if missing, rebuild from bytes when possible.
          let finalBlob = blob;
          if ((!finalBlob || !finalBlob.size) && bytes && bytes.byteLength) {
            finalBlob = blobFromBytes(bytes, type);
          }
          if (!finalBlob && !bytes) {
            // nothing to migrate for this key; skip it
            continue;
          }

          st.put({
            key,
            blob: finalBlob || null,
            bytes: bytes || (finalBlob ? null : null),
            type,
            createdAt,
            _recVer: RECORD_VERSION,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("migration tx aborted"));
      } catch (e) { reject(e); }
    });

    legacy.close();
    await putMetaFlag(db, "legacyMigratedV1", { value: true, migratedAt: Date.now() });
    MIGRATED_THIS_SESSION = true;
  } finally {
    db.close();
  }
}
/* ========================== END: One-Time Legacy Migration ========================= */

/* ======================== BEGIN: Pitch Clip Persistence API ======================== */
/**
 * savePitchClip(videoKey: string, blob: Blob) : Promise<void>
 * Stores { key, blob, bytes, type, createdAt, _recVer } and verifies read-back.
 */
export async function savePitchClip(videoKey, blob) {
  if (!videoKey) throw new Error("savePitchClip: missing videoKey");
  if (!(blob instanceof Blob)) throw new Error("savePitchClip: blob must be a Blob");

  // Ensure schema + migration state (no-op after first run)
  await ensureLegacyMigratedOnce();

  const db = await openPitchDB();
  const type = blob.type && blob.type.startsWith("video/") ? blob.type : "video/webm";
  const bytes = await blob.arrayBuffer();

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
      const st = tx.objectStore(STORE_PITCH_CLIPS);
      st.put({
        key: String(videoKey),
        blob,          // engines that persist Blob well
        bytes,         // engines that prefer raw bytes
        type,
        createdAt: Date.now(),
        _recVer: RECORD_VERSION,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("savePitchClip: tx aborted"));
    });
  } finally {
    db.close();
  }

  // Verify
  const verify = await getPitchClipBlob(videoKey);
  if (!(verify instanceof Blob) || !verify.size) {
    throw new Error("Saved pitch clip not found in IndexedDB.");
  }
}

/**
 * getPitchClipBlob(videoKey: string) : Promise<Blob|null>
 * Primary read with Blob->bytes fallback; if not found, runs legacy migration once.
 */
export async function getPitchClipBlob(videoKey) {
  if (!videoKey) return null;

  // Ensure we’ve attempted migration (idempotent)
  await ensureLegacyMigratedOnce();

  const db = await openPitchDB();
  try {
    const rec = await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_PITCH_CLIPS, "readonly");
        const st = tx.objectStore(STORE_PITCH_CLIPS);
        const req = st.get(String(videoKey));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });

    if (rec) {
      // Prefer Blob
      if (rec.blob instanceof Blob && rec.blob.size) {
        return ensureWebmType(rec.blob);
      }
      // Rebuild from bytes
      if (rec.bytes && rec.bytes.byteLength) {
        const rebuilt = blobFromBytes(rec.bytes, rec.type);
        return ensureWebmType(rebuilt);
      }
      return null;
    }
  } finally {
    db.close();
  }

  // If not found, try migrating (once per session) and re-read
  await ensureLegacyMigratedOnce();

  const db2 = await openPitchDB();
  try {
    const rec2 = await new Promise((resolve, reject) => {
      try {
        const tx = db2.transaction(STORE_PITCH_CLIPS, "readonly");
        const st = tx.objectStore(STORE_PITCH_CLIPS);
        const req = st.get(String(videoKey));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });

    if (rec2) {
      if (rec2.blob instanceof Blob && rec2.blob.size) {
        return ensureWebmType(rec2.blob);
      }
      if (rec2.bytes && rec2.bytes.byteLength) {
        const rebuilt = blobFromBytes(rec2.bytes, rec2.type);
        return ensureWebmType(rebuilt);
      }
    }

    return null;
  } finally {
    db2.close();
  }
}

/** Delete from primary DB only. */
export async function deletePitchClip(videoKey) {
  if (!videoKey) return false;
  await ensureLegacyMigratedOnce();
  const db = await openPitchDB();
  try {
    // existence check
    const exists = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PITCH_CLIPS, "readonly");
      const st = tx.objectStore(STORE_PITCH_CLIPS);
      const rq = st.getKey(String(videoKey));
      rq.onsuccess = () => resolve(!!rq.result);
      rq.onerror = () => reject(rq.error);
    });
    if (!exists) return false;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
      tx.objectStore(STORE_PITCH_CLIPS).delete(String(videoKey));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("deletePitchClip: aborted"));
    });
    return true;
  } finally {
    db.close();
  }
}

/** hasPitchClip — checks presence in primary DB (after migration). */
export async function hasPitchClip(videoKey) {
  if (!videoKey) return false;
  await ensureLegacyMigratedOnce();
  const db = await openPitchDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PITCH_CLIPS, "readonly");
      const st = tx.objectStore(STORE_PITCH_CLIPS);
      const rq = st.getKey(String(videoKey));
      rq.onsuccess = () => resolve(!!rq.result);
      rq.onerror = () => reject(rq.error);
    });
  } finally {
    db.close();
  }
}

/** listPitchClipKeys — enumerate stored keys (primary DB). */
export async function listPitchClipKeys() {
  await ensureLegacyMigratedOnce();
  const db = await openPitchDB();
  try {
    return await new Promise((resolve, reject) => {
      const keys = [];
      const tx = db.transaction(STORE_PITCH_CLIPS, "readonly");
      const st = tx.objectStore(STORE_PITCH_CLIPS);
      const req = st.openKeyCursor();
      req.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) { keys.push(cur.key); cur.continue(); } else { resolve(keys); }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
/* ========================= END: Pitch Clip Persistence API ========================= */

/* =========================== BEGIN: Legacy/Nested Helpers =========================== */
/**
 * NOTE: These remain to keep older calling code happy. Your App.jsx currently
 * uses flat arrays for swings/pitches, but these constructors won’t break that.
 */
export function createHitter(name) {
  return { name, swings: [] };
}

export function createPitcher(name) {
  return { name, pitches: [] };
}

export function findHitter(hitters, name) {
  return Array.isArray(hitters) ? hitters.find((h) => h?.name === name) : undefined;
}

export function findPitcher(pitchers, name) {
  return Array.isArray(pitchers) ? pitchers.find((p) => p?.name === name) : undefined;
}
/* ============================ END: Legacy/Nested Helpers ============================ */

/* ============================ BEGIN: Optional Dev Utils ============================= */
/** Create a revocable object URL for a Blob (caller must revoke). */
export function blobToObjectURL(blob) {
  if (!(blob instanceof Blob)) return null;
  try { return URL.createObjectURL(blob); } catch { return null; }
}

/** Fetch a URL to Blob and normalize to a video/webm if needed. */
export async function fetchAsWebmBlob(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return ensureWebmType(blob);
}
/* ============================= END: Optional Dev Utils ============================= */
