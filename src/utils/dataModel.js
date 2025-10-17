// src/utils/dataModel.js
/* =====================================================================================
   Swing Sync Data Model — IndexedDB storage for pitch + swing + matchup clips
   -------------------------------------------------------------------------------------
   Stores ArrayBuffer bytes + MIME type (no raw Blob).
   Provides save/get/delete/list functions for PITCH, SWING, and MATCHUP clips.
   ===================================================================================== */

/* ===== Constants ===== */
export const DB_NAME = "SwingSyncDB";
export const DB_VERSION = 1; // reset schema, clean slate

export const STORE_PITCH_CLIPS = "pitchClips";
export const STORE_SWING_CLIPS = "swingClips";
export const STORE_MATCHUP_CLIPS = "matchupClips";

/* ===== Utilities ===== */
function blobFromBytes(bytes, type = "video/webm") {
  try {
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PITCH_CLIPS)) {
        db.createObjectStore(STORE_PITCH_CLIPS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SWING_CLIPS)) {
        db.createObjectStore(STORE_SWING_CLIPS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_MATCHUP_CLIPS)) {
        db.createObjectStore(STORE_MATCHUP_CLIPS, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* =====================================================================================
   PITCH CLIP API
   ===================================================================================== */
export async function savePitchClip(videoKey, blob, description = "", contactFrame = null) {
  const db = await openDB();
  const bytes = await blob.arrayBuffer();
  const type = blob.type && blob.type.startsWith("video/") ? blob.type : "video/webm";

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
    tx.objectStore(STORE_PITCH_CLIPS).put({
      key: videoKey,
      bytes,
      type,
      description,
      contactFrame,
      createdAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getPitchClipBlob(videoKey) {
  const db = await openDB();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PITCH_CLIPS, "readonly");
    const req = tx.objectStore(STORE_PITCH_CLIPS).get(videoKey);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!rec) return null;
  return blobFromBytes(rec.bytes, rec.type);
}

export async function deletePitchClip(videoKey) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
    tx.objectStore(STORE_PITCH_CLIPS).delete(videoKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listPitchClipKeys() {
  const db = await openDB();
  const keys = await new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(STORE_PITCH_CLIPS, "readonly");
    const req = tx.objectStore(STORE_PITCH_CLIPS).openCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        out.push({ key: cur.key, description: cur.value.description });
        cur.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return keys;
}

/* =====================================================================================
   SWING CLIP API
   ===================================================================================== */
export async function saveSwingClip(
  videoKey,
  blob,
  hitterName,
  description = "",
  startFrame = null,
  contactFrame = null,
  adjustments = null
) {
  const db = await openDB();
  const bytes = await blob.arrayBuffer();
  const type = blob.type && blob.type.startsWith("video/") ? blob.type : "video/webm";

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SWING_CLIPS, "readwrite");
    tx.objectStore(STORE_SWING_CLIPS).put({
      key: videoKey,
      bytes,
      type,
      hitterName,
      description,
      startFrame,
      contactFrame,
      adjustments,
      createdAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getSwingClipBlob(videoKey) {
  const db = await openDB();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SWING_CLIPS, "readonly");
    const req = tx.objectStore(STORE_SWING_CLIPS).get(videoKey);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!rec) return null;
  return blobFromBytes(rec.bytes, rec.type);
}

export async function deleteSwingClip(videoKey) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SWING_CLIPS, "readwrite");
    tx.objectStore(STORE_SWING_CLIPS).delete(videoKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listSwingClipKeys() {
  const db = await openDB();
  const swings = await new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(STORE_SWING_CLIPS, "readonly");
    const req = tx.objectStore(STORE_SWING_CLIPS).openCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        const { hitterName, description, startFrame, contactFrame, adjustments } = cur.value || {};
        out.push({ key: cur.key, hitterName, description, startFrame, contactFrame, adjustments });
        cur.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return swings;
}

/* =====================================================================================
   MATCHUP CLIP API
   ===================================================================================== */
/* ===========================
   MATCHUP CLIP STORAGE
   =========================== */

export async function saveMatchupClip(key, blob, meta = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = (ev) => {
      const db = ev.target.result;
      const tx = db.transaction(STORE_MATCHUP_CLIPS, "readwrite");
      const store = tx.objectStore(STORE_MATCHUP_CLIPS);

      // ✅ keyPath schema expects the key inside the object, not as a param
      const record = {
        key,
        blob,
        type: blob?.type || "video/webm",
        createdAt: Date.now(),
        ...meta,
      };

      store.put(record); // <— no key param

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMatchupClipBlob(key) {
  if (!key) throw new Error("getMatchupClipBlob: key required");

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = (ev) => {
      const db = ev.target.result;
      const tx = db.transaction(STORE_MATCHUP_CLIPS, "readonly");
      const store = tx.objectStore(STORE_MATCHUP_CLIPS);

      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (!data) {
          reject(new Error(`No matchup found for key ${key}`));
          return;
        }
        // Support both plain Blob and wrapped record
        const blob = data instanceof Blob ? data : data.blob;
        resolve(blob);
      };
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMatchupClip(videoKey) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MATCHUP_CLIPS, "readwrite");
    tx.objectStore(STORE_MATCHUP_CLIPS).delete(videoKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listMatchupClipKeys() {
  const db = await openDB();
  const matchups = await new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(STORE_MATCHUP_CLIPS, "readonly");
    const req = tx.objectStore(STORE_MATCHUP_CLIPS).openCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        const v = cur.value;
        out.push({
          key: v.key,
          hitterName: v.hitterName,
          swingIndex: v.swingIndex,
          pitcherName: v.pitcherName,
          pitchIndex: v.pitchIndex,
          labelType: v.labelType || "sidebyside",
          description: v.description || "",
          createdAt: v.createdAt,
        });
        cur.continue();
      } else resolve(out.sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return matchups;
}


/* =====================================================================================
   UPDATE DESCRIPTION HELPERS
   ===================================================================================== */
export async function updateSwingDescription(videoKey, newDescription) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SWING_CLIPS, "readwrite");
    const store = tx.objectStore(STORE_SWING_CLIPS);
    const getReq = store.get(videoKey);
    getReq.onsuccess = () => {
      const data = getReq.result;
      if (!data) return resolve(false);
      data.description = newDescription;
      store.put(data);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
  db.close();
}

export async function updatePitchDescription(videoKey, newDescription) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
    const store = tx.objectStore(STORE_PITCH_CLIPS);
    const getReq = store.get(videoKey);
    getReq.onsuccess = () => {
      const data = getReq.result;
      if (!data) return resolve(false);
      data.description = newDescription;
      store.put(data);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
  db.close();
}


/* =====================================================================================
   Helpers
   ===================================================================================== */
export function createHitter(name) {
  return { name, swings: [] };
}
export function addSwing(hitter, swing) {
  hitter.swings.push(swing);
  return swing;
}
export function deleteSwing(hitter, index) {
  hitter.swings.splice(index, 1);
}

export function createPitcher(name, description = "", teamName = "") {
  return { name, description, teamName, pitches: [] };
}
export function addPitch(pitcher, pitch) {
  pitcher.pitches.push(pitch);
  return pitch;
}
export function deletePitch(pitcher, index) {
  pitcher.pitches.splice(index, 1);
}

export function findHitter(hitters, name) {
  return hitters.find((h) => h.name === name);
}
export function findPitcher(pitchers, name) {
  return pitchers.find((p) => p.name === name);
}

export async function deleteAllClips() {
  const db = await openDB();
  await Promise.all(
    Array.from(db.objectStoreNames).map(
      (storeName) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).clear();
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        })
    )
  );
  db.close();
  console.log("✅ All clips deleted (pitches, swings, matchups)");
}

export async function deleteAllSwingClips() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SWING_CLIPS, "readwrite");
    tx.objectStore(STORE_SWING_CLIPS).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  console.log("✅ All swing clips deleted");
}
