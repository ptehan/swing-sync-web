// src/components/VideoTagger.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* =============================================================================
   VideoTagger — RVFC-driven tagger (overlay auto-disabled for matchups)
   -----------------------------------------------------------------------------
   INTENT:
   - Smooth playback + precise frame step using requestVideoFrameCallback (RVFC).
   - Tag pitch contact OR swing start/contact.
   - When called by MatchupSimulator (label starts with "Matchup:"), DO NOT show
     the Tagger HUD overlay (since the matchup clip already has its own overlay).
   - Buttons are compact, and tagging rows are shown only when relevant.
   - No prop contract changes. One-file patch.
   ========================================================================== */

/* ============================== BEGIN: Constants ============================ */
const DEFAULT_FPS = 30;
const SEEK_TIMEOUT_MS = 1500;        // seek failsafe
const FRAME_EPSILON = 1e-3;          // time comparison slop
/* =============================== END: Constants ============================= */

/* ======================= BEGIN: Utility helpers ============================ */
function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }
function timeToFrame(t, fps) { return Math.round(t * fps); }
function frameToTime(f, fps) { return f / fps; }
/* ======================== END: Utility helpers ============================= */

/* ===================== BEGIN: Tag-mode inference (label) =================== */
/**
 * getTagMode(label) -> 'pitch' | 'swing' | 'matchup' | 'both'
 * We infer from the developer-provided label (no prop changes).
 */
function getTagMode(labelRaw) {
  const label = (labelRaw || "").toLowerCase();
  if (label.startsWith("matchup:")) return "matchup";
  if (/(^|\s)(pitch|pitching)\b/.test(label)) return "pitch";
  if (/(^|\s)(swing|hitting|hitter)\b/.test(label)) return "swing";
  return "both";
}
/* ====================== END: Tag-mode inference (label) ==================== */

/* =========================== BEGIN: Component ============================== */
export default function VideoTagger({
  // Always a STRING URL or null. App handles object-URL creation/revocation.
  source,
  metadata = {},                 // { label?: string }
  fps = DEFAULT_FPS,
  onTagSwing,                    // ({ startFrame, contactFrame }) => void
  onTagPitchContact,             // (contactFrame) => void
}) {
  /* --------------------------- BEGIN: Refs & State ------------------------ */
  const videoRef = useRef(null);
  const rvfcIdRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [presentedTime, setPresentedTime] = useState(0); // decoder-presented time
  const [isPlaying, setIsPlaying] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");

  // Local swing tag scratch so we can send both values together
  const [swingStart, setSwingStart] = useState(null);     // frame index
  const [swingContact, setSwingContact] = useState(null); // frame index
  const [pitchContact, setPitchContact] = useState(null); // frame index
  /* ---------------------------- END: Refs & State ------------------------- */

  const infoLabel = (metadata?.label || "").trim();
  const tagMode = useMemo(() => getTagMode(infoLabel), [infoLabel]);

  const isMatchupPlayback = tagMode === "matchup"; // ← hide HUD & tagging
  const showHudOverlay = !isMatchupPlayback;

  const showPitchTagRow = tagMode === "pitch" || tagMode === "both";
  const showSwingTagRow = tagMode === "swing" || tagMode === "both";

  const frame = useMemo(() => timeToFrame(presentedTime, fps), [presentedTime, fps]);

  /* ---------------------- BEGIN: RVFC loop (smooth HUD) ------------------- */
  const cancelRVFC = useCallback(() => {
    const v = videoRef.current;
    try {
      if (!v) return;
      if (rvfcIdRef.current > 0 && v.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(rvfcIdRef.current);
      } else if (rvfcIdRef.current < 0) {
        clearInterval(-rvfcIdRef.current);
      }
    } catch {}
    rvfcIdRef.current = 0;
  }, []);

  const startRVFC = useCallback(() => {
    cancelRVFC();
    const v = videoRef.current;
    if (!v) return;

    const hasRVFC = typeof v.requestVideoFrameCallback === "function";
    if (!hasRVFC) {
      const id = setInterval(() => {
        if (!videoRef.current) { clearInterval(id); return; }
        setPresentedTime(videoRef.current.currentTime || 0);
      }, 33);
      rvfcIdRef.current = -id; // mark as interval
      return;
    }

    const loop = (_now, md) => {
      setPresentedTime((md?.mediaTime ?? v.currentTime) || 0);
      rvfcIdRef.current = v.requestVideoFrameCallback(loop);
    };
    rvfcIdRef.current = v.requestVideoFrameCallback(loop);
  }, [cancelRVFC]);
  /* ----------------------- END: RVFC loop (smooth HUD) -------------------- */

  /* ------------------------- BEGIN: Load / cleanup ------------------------ */
  useEffect(() => {
    setErr("");
    setStatus("");
    setDuration(0);
    setPresentedTime(0);
    setIsPlaying(false);
    // clear local tags when a new video loads
    setSwingStart(null);
    setSwingContact(null);
    setPitchContact(null);

    const v = videoRef.current;
    if (!v) return;

    const onError = () => {
      const code = v?.error?.code;
      const msg = code === 4
        ? "MEDIA_ERR_SRC_NOT_SUPPORTED"
        : v?.error?.message || "Video error.";
      setErr(`Video error: ${msg}`);
    };
    v.addEventListener("error", onError);

    const onLoaded = () => {
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      startRVFC();
    };
    v.addEventListener("loadedmetadata", onLoaded);

    v.pause();

    return () => {
      v.removeEventListener("error", onError);
      v.removeEventListener("loadedmetadata", onLoaded);
      cancelRVFC();
    };
  }, [source, startRVFC, cancelRVFC]);
  /* -------------------------- END: Load / cleanup ------------------------- */

  /* ---------------------- BEGIN: Playback controls ------------------------ */
  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    setErr("");
    try {
      if (v.paused || v.ended) {
        await v.play();
        setIsPlaying(true);
      } else {
        v.pause();
        setIsPlaying(false);
      }
    } catch {
      setErr("Autoplay blocked. Click anywhere once, then try again.");
    }
  }, []);

  // Seek to a time and wait until a *new* presented frame crosses target.
  const seekTo = useCallback(async (target, direction = +1) => {
    const v = videoRef.current;
    if (!v) return;

    return new Promise((resolve, reject) => {
      let timeoutId;
      const hasRVFC = typeof v.requestVideoFrameCallback === "function";

      const done = () => { clearTimeout(timeoutId); resolve(); };
      const onError = () => { clearTimeout(timeoutId); reject(new Error("Seek failed.")); };

      const safeTarget = clamp(target, 0, Math.max(0, (v.duration || 0) - 1 / (fps * 2)));
      const check = (_now, md) => {
        const t = md?.mediaTime ?? v.currentTime;
        if (direction > 0 ? t + FRAME_EPSILON >= safeTarget : t <= safeTarget + FRAME_EPSILON) {
          done();
        } else {
          v.requestVideoFrameCallback(check);
        }
      };

      timeoutId = setTimeout(done, SEEK_TIMEOUT_MS);

      v.addEventListener("error", onError, { once: true });
      v.currentTime = safeTarget;

      if (hasRVFC) {
        v.requestVideoFrameCallback(check);
      } else {
        const onSeeked = () => { v.removeEventListener("seeked", onSeeked); done(); };
        v.addEventListener("seeked", onSeeked, { once: true });
      }
    });
  }, [fps]);

  // Frame step from the *current presented* frame, guaranteed fresh image.
  const stepFrames = useCallback(async (deltaFrames) => {
    const v = videoRef.current;
    if (!v) return;
    setErr("");
    v.pause();
    setIsPlaying(false);

    const dt = deltaFrames / fps;
    const startAt = presentedTime || v.currentTime || 0;
    const target = startAt + dt;
    setStatus(`Stepping ${deltaFrames > 0 ? "+" : ""}${deltaFrames}f…`);
    await seekTo(target, deltaFrames >= 0 ? +1 : -1);
    setStatus("");
  }, [fps, presentedTime, seekTo]);
  /* ----------------------- END: Playback controls ------------------------- */

  /* ------------------------ BEGIN: Tagging handlers ------------------------ */
  const tagPitchContact = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setPitchContact(f);
    setStatus(`Pitch contact set @ frame ${f}`);
    if (typeof onTagPitchContact === "function") onTagPitchContact(f);
  }, [fps, presentedTime, onTagPitchContact]);

  const tagSwingStart = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setSwingStart(f);
    const payload = { startFrame: f, contactFrame: swingContact ?? null };
    setStatus(`Swing start set @ frame ${f}`);
    if (typeof onTagSwing === "function") onTagSwing(payload);
  }, [fps, presentedTime, swingContact, onTagSwing]);

  const tagSwingContact = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setSwingContact(f);
    const payload = { startFrame: swingStart ?? null, contactFrame: f };
    setStatus(`Swing contact set @ frame ${f}`);
    if (typeof onTagSwing === "function") onTagSwing(payload);
  }, [fps, presentedTime, swingStart, onTagSwing]);

  const clearSwing = useCallback(() => {
    setSwingStart(null);
    setSwingContact(null);
    setStatus("Cleared swing tags.");
    if (typeof onTagSwing === "function") onTagSwing({ startFrame: null, contactFrame: null });
  }, [onTagSwing]);

  const clearPitch = useCallback(() => {
    setPitchContact(null);
    setStatus("Cleared pitch contact.");
    if (typeof onTagPitchContact === "function") onTagPitchContact(null);
  }, [onTagPitchContact]);
  /* ------------------------- END: Tagging handlers ------------------------- */

  /* ------------------------------ BEGIN: UI -------------------------------- */
  // Compact button style (applied to all our buttons)
  const BTN_S = {
    fontSize: 12,
    lineHeight: 1.1,
    padding: "4px 6px",
    borderRadius: 4,
  };
  const LABEL_S = { fontSize: 12, alignSelf: "center", opacity: 0.85 };

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateRows: "1fr auto", gap: 8, padding: 8, boxSizing: "border-box" }}>
      {/* ==== Video area ==== */}
      <div style={{ position: "relative", background: "#000", border: "1px solid #ddd" }}>
        {source ? (
          <video
            ref={videoRef}
            src={source}
            playsInline
            controls
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
          />
        ) : (
          <div style={{ color: "#999", display: "grid", placeItems: "center", height: "100%" }}>
            Load a video to tag.
          </div>
        )}

        {/* HUD overlay (hidden for matchup playback) */}
        {showHudOverlay && (
          <div
            style={{
              position: "absolute",
              left: 8,
              top: 8,
              padding: "6px 8px",
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
              fontSize: 12,
              borderRadius: 6,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontWeight: 600 }}>{infoLabel}</div>
            <div>t={presentedTime.toFixed(3)}s • f={frame}</div>
            <div>dur={duration.toFixed(3)}s • fps={fps}</div>
            {pitchContact !== null && <div>Pitch contact: f{pitchContact}</div>}
            {(swingStart !== null || swingContact !== null) && (
              <div>
                Swing: start {swingStart ?? "—"} / contact {swingContact ?? "—"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==== Controls ==== */}
      <div style={{ borderTop: "1px solid #ddd", paddingTop: 8, display: "grid", gap: 8 }}>
        {/* Transport */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button style={BTN_S} onClick={() => stepFrames(-1)} disabled={!source}>◀︎ 1f</button>
          <button style={BTN_S} onClick={togglePlay} disabled={!source}>{isPlaying ? "Pause" : "Play"}</button>
          <button style={BTN_S} onClick={() => stepFrames(+1)} disabled={!source}>1f ▶︎</button>

          <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 12 }}>
            {status}
          </div>
        </div>

        {/* Tagging rows (conditional) */}
        {showPitchTagRow && !isMatchupPlayback && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={LABEL_S}><strong>Pitch</strong></span>
            <button style={BTN_S} onClick={tagPitchContact} disabled={!source}>Set Contact @ f{frame}</button>
            <button style={BTN_S} onClick={clearPitch} disabled={!source}>Clear</button>
          </div>
        )}

        {showSwingTagRow && !isMatchupPlayback && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={LABEL_S}><strong>Swing</strong></span>
            <button style={BTN_S} onClick={tagSwingStart} disabled={!source}>Set Start @ f{frame}</button>
            <button style={BTN_S} onClick={tagSwingContact} disabled={!source}>Set Contact @ f{frame}</button>
            <button style={BTN_S} onClick={clearSwing} disabled={!source}>Clear</button>
          </div>
        )}

        {!!err && <div style={{ color: "crimson", fontSize: 12 }}>{err}</div>}
      </div>
    </div>
  );
  /* ------------------------------- END: UI --------------------------------- */
}
/* ============================ END: Component =============================== */
