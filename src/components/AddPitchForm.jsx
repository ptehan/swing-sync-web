// src/components/AddPitchForm.jsx
import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import {
  savePitchClip,
  ensureWebmType,
  hasPitchClip,
  getPitchClipBlob,
  listPitchClipKeys,
} from "../utils/dataModel";

/* =============================================================================
   AddPitchForm — smooth recorder (video.captureStream) + verifiable save
   -----------------------------------------------------------------------------
   WHY: Canvas+RAF recording can jitter and overrun → long clips. This version
   uses the browser's decoded frames via <video>.captureStream(), and stops the
   recorder precisely at endSec.

   Spec alignment:
   - Clip = 2.0s pre-contact → contact (include contact frame).
   - Register: { contactFrame: 60, videoKey, description? }.
   - Minimal UI; includes status line and optional verify/open helpers.

   NOTE: Added 'description' (optional) for pitch metadata. App’s onAddPitch
         already spreads extra fields, so no other files need edits for this.
   ========================================================================== */

const CONTACT_IN_CLIP = 60; // 2s @ 30fps

export default function AddPitchForm({
  pitchers,
  onAddPitch,
  taggedContactFrame,
  clearTag,
  requestLoadVideoInTagger,
  constants = { FPS: 30 },
}) {
  const FPS = Number(constants?.FPS) || 30;

  // ----------------------------- BEGIN: Local State --------------------------
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState(""); // <-- NEW: optional pitch description
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [lastKey, setLastKey] = useState(null);
  const fileInputRef = useRef(null);
  // ------------------------------ END: Local State ---------------------------

  // ------------------------- BEGIN: Derived (contact frame) ------------------
  const contactFrameNum = useMemo(() => {
    const n = Number(taggedContactFrame);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }, [taggedContactFrame]);

  const canSave = !!selectedPitcher && !!file && Number.isFinite(contactFrameNum) && !isSaving;
  // -------------------------- END: Derived (contact frame) -------------------

  // --------------------- BEGIN: onChangeFile (auto-load tagger) --------------
  const onChangeFile = useCallback(
    (e) => {
      const f = e.target.files?.[0] || null;
      setFile(f);
      setError("");
      setStatus("");
      setLastKey(null);
      clearTag?.();
      if (f && requestLoadVideoInTagger) {
        requestLoadVideoInTagger(
          f,
          selectedPitcher ? `Pitch tagging: ${selectedPitcher}` : "Pitch tagging"
        );
      }
    },
    [clearTag, requestLoadVideoInTagger, selectedPitcher]
  );
  // ---------------------- END: onChangeFile (auto-load tagger) ---------------

  // ============================ Recorder (SMOOTH) ============================
  function chooseBestMime() {
    if (!window.MediaRecorder) return "";
    const cands = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2", // Safari
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    return cands.find((m) => MediaRecorder.isTypeSupported(m)) || "";
  }

  /**
   * recordSegmentViaVideoStream
   * --------------------------------------------------------------------------
   * Record [startSec, endSec) by:
   *   - creating a hidden <video> bound to the source file
   *   - seeking to startSec
   *   - starting MediaRecorder on video.captureStream()
   *   - playing until currentTime >= endSec - epsilon, then pausing+stopping
   *
   * This avoids canvas jitter and produces smooth, short clips.
   */
  async function recordSegmentViaVideoStream(srcFile, startSec, endSec, fps = 30) {
    setStatus("Preparing recorder…");

    const mime = chooseBestMime();
    if (!mime) throw new Error("Recording not supported in this browser.");

    // --- Hidden <video> with the source file ---
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;

    let objectUrl = "";
    try {
      objectUrl = URL.createObjectURL(srcFile);
      video.src = objectUrl;
    } catch {
      throw new Error("Could not load the selected video file.");
    }

    // Wait metadata
    await new Promise((resolve, reject) => {
      const onLoaded = () => resolve();
      const onErr = () => reject(new Error("Failed to load video metadata."));
      video.addEventListener("loadedmetadata", onLoaded, { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      throw new Error("Source video has no readable duration.");
    }

    // Clamp times; ensure at least 1 frame
    const startClamped = Math.max(0, Math.min(startSec, Math.max(0, duration - 1 / fps)));
    const endMin = startClamped + 1 / fps;
    const endClamped = Math.max(endMin, Math.min(endSec, duration));
    const endAt = endClamped;
    const epsilon = 1 / (fps * 2);

    // Some browsers only activate captureStream once playback starts
    const stream =
      (video.captureStream && video.captureStream()) ||
      (video.mozCaptureStream && video.mozCaptureStream());
    if (!stream) {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      throw new Error("captureStream() not supported for <video>.");
    }

    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 4_000_000,
      });
    } catch {
      try { URL.revokeObjectURL(objectUrl); } catch {}
      throw new Error("MediaRecorder failed to start.");
    }

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e?.data && e.data.size) chunks.push(e.data);
    };

    const waitStop = () => new Promise((res) => (recorder.onstop = () => res()));

    const cleanup = () => {
      try { video.pause(); } catch {}
      try { URL.revokeObjectURL(objectUrl); } catch {}
    };

    // Seek to start and wait
    setStatus("Seeking to clip start…");
    await new Promise((resolve, reject) => {
      const onSeeked = () => resolve();
      const onErr = () => reject(new Error("Seek to start failed."));
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onErr, { once: true });
      video.currentTime = startClamped;
    });

    // Start playback, then start recorder immediately
    try {
      await video.play();
    } catch {
      cleanup();
      throw new Error("Autoplay blocked. Click anywhere, then retry Save.");
    }

    recorder.start(); // no timeslice; we’ll requestData() at stop

    // Precise stop: poll currentTime and stop exactly at endAt
    setStatus("Recording clip…");
    let rafId = 0;
    const tick = () => {
      const t = video.currentTime || 0;
      if (t >= endAt - epsilon) {
        try { video.pause(); } catch {}
        try { recorder.requestData(); } catch {}
        try { recorder.stop(); } catch {}
        cancelAnimationFrame(rafId);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    await waitStop();
    cleanup();

    let out = new Blob(chunks, { type: mime });
    if (!out || !out.size) throw new Error("Rendered clip is empty.");
    // Normalize odd/missing types (esp. Chromium)
    out = out.type?.startsWith("video/") ? out : ensureWebmType(out);
    return out;
  }
  // ========================== END Recorder (SMOOTH) ==========================

  // --------------------- BEGIN: verify (prove it’s saved) --------------------
  async function verifySavedClip(videoKey) {
    const exists = await hasPitchClip(videoKey);
    const blob = await getPitchClipBlob(videoKey);
    const size = blob?.size || 0;
    const type = blob?.type || "unknown";
    return { ok: !!blob && size > 0 && exists, size, type };
  }

  useEffect(() => {
    window.__swingSyncDebug = {
      async listKeys() {
        const keys = await listPitchClipKeys();
        console.log("[SwingSync] keys:", keys);
        return keys;
      },
    };
  }, []);
  // ---------------------- END: verify (prove it’s saved) ---------------------

  // ---------------------- BEGIN: submit (render + save) ----------------------
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!canSave) return;

      setError("");
      setStatus("Starting render…");
      setIsSaving(true);
      setLastKey(null);

      try {
        // Source window: 2.0s pre-contact → contact (include contact frame)
        const contactF = contactFrameNum;
        const startFrame = Math.max(0, contactF - 2 * FPS);
        const startSec = startFrame / FPS;
        const endSec = (contactF + 1) / FPS; // end-exclusive

        const clipBlob = await recordSegmentViaVideoStream(file, startSec, endSec, FPS);

        setStatus("Saving clip…");
        const videoKey = `pitch_${selectedPitcher}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        await savePitchClip(videoKey, clipBlob);

        setStatus("Verifying saved clip…");
        const verify = await verifySavedClip(videoKey);
        if (!verify.ok) throw new Error("Saved pitch clip not found in IndexedDB.");

        // Register pitch with contact-in-clip = 60 (spec) + optional description
        onAddPitch(selectedPitcher, {
          contactFrame: CONTACT_IN_CLIP,
          videoKey,
          description: description.trim() || "",
        });

        setStatus(`Saved ✓  (key: ${videoKey}, ${verify.size} bytes, ${verify.type})`);
        setLastKey(videoKey);

        // Cleanup per spec: close right pane
        clearTag?.();
        setFile(null);
        setDescription("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        requestLoadVideoInTagger?.(null);
      } catch (err) {
        console.error("[AddPitchForm] Save failed:", err);
        setError(err?.message || "Failed to save pitch clip.");
        setStatus("");
      } finally {
        setIsSaving(false);
      }
    },
    [
      canSave,
      contactFrameNum,
      FPS,
      file,
      onAddPitch,
      selectedPitcher,
      description,
      clearTag,
      requestLoadVideoInTagger,
    ]
  );
  // ----------------------- END: submit (render + save) -----------------------

  // ------------------- BEGIN: tiny helpers (open/verify last) ----------------
  const openLastClip = useCallback(async () => {
    if (!lastKey) return;
    const blob = await getPitchClipBlob(lastKey);
    if (!blob) {
      alert("No blob found for last saved key.");
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }, [lastKey]);

  const checkLastClip = useCallback(async () => {
    if (!lastKey) return;
    const ok = await hasPitchClip(lastKey);
    const blob = await getPitchClipBlob(lastKey);
    alert(
      ok
        ? `In DB ✓\nKey: ${lastKey}\nBytes: ${blob?.size || 0}\nType: ${blob?.type || "unknown"}`
        : `NOT in DB ✗\nKey: ${lastKey}`
    );
  }, [lastKey]);
  // -------------------- END: tiny helpers (open/verify last) -----------------

  // ================================= RENDER =================================
  return (
    <form onSubmit={handleSubmit}>
      <h3 style={{ marginTop: 0 }}>Add Pitch</h3>

      <div style={{ display: "grid", gap: 8 }}>
        {/* Pitcher */}
        <label style={{ display: "grid", gap: 4 }}>
          <span>Pitcher</span>
          <select
            value={selectedPitcher}
            onChange={(e) => setSelectedPitcher(e.target.value)}
          >
            <option value="">-- Select Pitcher --</option>
            {pitchers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* File input */}
        <label style={{ display: "grid", gap: 4 }}>
          <span>Pitch Video</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={onChangeFile}
          />
        </label>

        {/* Optional description (NEW) */}
        <label style={{ display: "grid", gap: 4 }}>
          <span>Pitch Description (optional)</span>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., 4-seam fastball, inside corner"
          />
        </label>

        {/* Status */}
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          {file
            ? "Loaded into the right pane. Tag the contact frame there."
            : "Choose a video to load it in the right pane."}
          {"  "}Contact frame (source):{" "}
          {Number.isFinite(contactFrameNum) ? contactFrameNum : "—"}
          {status ? <div style={{ marginTop: 4 }}>Status: {status}</div> : null}
        </div>

        {/* Save */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" disabled={!canSave}>
            {isSaving ? "Saving..." : "Save Tagged Pitch"}
          </button>
          {!canSave && (
            <small style={{ opacity: 0.7 }}>
              Select a pitcher, choose a video, and tag the contact frame.
            </small>
          )}
        </div>

        {/* Optional: quick verify/open last clip */}
        {lastKey && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={checkLastClip}>Verify in DB</button>
            <button type="button" onClick={openLastClip}>Open last saved clip</button>
            <small style={{ opacity: 0.7 }}>key: {lastKey}</small>
          </div>
        )}

        {error && (
          <div style={{ color: "crimson", fontSize: 13, marginTop: 4 }}>
            {error}
          </div>
        )}
      </div>
    </form>
  );
}
