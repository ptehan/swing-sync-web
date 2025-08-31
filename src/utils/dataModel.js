// src/utils/dataModel.js
/* =====================================================================================
   Swing Sync Data Model — IndexedDB storage for pitch + swing clips
   -------------------------------------------------------------------------------------
   Stores both Blob + bytes for reliability.
   Provides save/get/delete/list functions for both PITCH and SWING clips.
   ===================================================================================== */

/* ===== Constants ===== */
export const DB_NAME = "SwingSyncDB_v2";
export const DB_VERSION = 1;

export const STORE_PITCH_CLIPS = "pitchClips";
export const STORE_SWING_CLIPS = "swingClips";

/* ===== Utilities ===== */
export function ensureWebmType(blob) {
  if (!(blob instanceof Blob)) return null;
  if (blob.type && blob.type.startsWith("video/")) return blob;
  try {
    return new Blob([blob], { type: "video/webm" });
  } catch {
    return blob;
  }
}

function blobFromBytes(bytes, type = "video/webm") {
  try {
    return new Blob([bytes], { type: type || "video/webm" });
  } catch {
    return null;
  }
}

/* ===== DB Open ===== */
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* =====================================================================================
   PITCH CLIP API
   ===================================================================================== */
export async function savePitchClip(videoKey, blob) {
  const db = await openDB();
  const bytes = await blob.arrayBuffer();
  const type = blob.type && blob.type.startsWith("video/") ? blob.type : "video/webm";
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PITCH_CLIPS, "readwrite");
    tx.objectStore(STORE_PITCH_CLIPS).put({
      key: videoKey,
      blob,
      bytes,
      type,
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
  if (rec.blob instanceof Blob && rec.blob.size) return ensureWebmType(rec.blob);
  if (rec.bytes) return ensureWebmType(blobFromBytes(rec.bytes, rec.type));
  return null;
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
    const req = tx.objectStore(STORE_PITCH_CLIPS).openKeyCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        out.push(cur.key);
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
export async function saveSwingClip(videoKey, blob) {
  const db = await openDB();
  const bytes = await blob.arrayBuffer();
  const type = blob.type && blob.type.startsWith("video/") ? blob.type : "video/webm";
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SWING_CLIPS, "readwrite");
    tx.objectStore(STORE_SWING_CLIPS).put({
      key: videoKey,
      blob,
      bytes,
      type,
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
  if (rec.blob instanceof Blob && rec.blob.size) return ensureWebmType(rec.blob);
  if (rec.bytes) return ensureWebmType(blobFromBytes(rec.bytes, rec.type));
  return null;
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
  const keys = await new Promise((resolve, reject) => {
    const out = [];
    const tx = db.transaction(STORE_SWING_CLIPS, "readonly");
    const req = tx.objectStore(STORE_SWING_CLIPS).openKeyCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (cur) {
        out.push(cur.key);
        cur.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return keys;
}

/* =====================================================================================
   Legacy helpers (unchanged, still useful for App.jsx state)
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

export function createPitcher(name) {
  return { name, pitches: [] };
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
