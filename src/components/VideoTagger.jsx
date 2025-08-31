// src/components/VideoTagger.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

/* =============================================================================
   INTENT
   - Keep tagging UI exactly the same for pitch/swing.
   - For "matchup" playback, ALWAYS show a bottom footer bar with the label text.
   - Append " | Swing Time: ### ms" (derived from yellow flash → contact).
   - No changes to App.jsx or callers. It uses metadata.label as before.
   ========================================================================== */

const DEFAULT_FPS = 30;

/* ==== Helpers: time + mode ==== */
function timeToFrame(t, fps) { return Math.round(t * fps); }
function getTagMode(labelRaw) {
  const label = (labelRaw || "").toLowerCase();
  if (label.startsWith("matchup:")) return "matchup";
  if (/(^|\s)(pitch|pitching)\b/.test(label)) return "pitch";
  if (/(^|\s)(swing|hitting|hitter)\b/.test(label)) return "swing";
  return "both";
}

/* ==== Footer Bar (matchup only) ==== */
function FooterBar({ text }) {
  if (!text) return null;
  const safe = String(text).trim();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "6px 10px",
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        fontSize: 12,
        lineHeight: "14px",
        fontWeight: 600,
        textShadow: "0 1px 0 rgba(0,0,0,0.7)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      }}
      title={safe}
    >
      {safe}
    </div>
  );
}

/* ==== Yellow-flash detection ==== 
   We downscale the current frame to a small canvas and detect the 3-frame
   translucent yellow overlay (R,G high vs B lower). We only need the first
   frame index where it appears ("flashStartFrame").
============================================================================= */
function isYellowishFrame(ctx, w, h) {
  if (!w || !h) return false;
  const { data } = ctx.getImageData(0, 0, w, h);
  let yellowish = 0;
  const total = w * h;
  // Sample every 4th pixel for speed
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Heuristic: bright-ish yellow (overlay boost): R,G high; B relatively lower
    if (r > 150 && g > 150 && b < 140 && ((r + g) / 2 - b) > 40) yellowish++;
  }
  return yellowish / (total / 4) > 0.6; // majority of sampled pixels look yellowish
}

/* =============================================================================
   Component
   ========================================================================== */
export default function VideoTagger({
  source,
  metadata = {},
  fps = DEFAULT_FPS,
  onTagSwing,
  onTagPitchContact,
}) {
  // ---------- Refs + State ----------
  const videoRef = useRef(null);

  // offscreen canvas for detection (kept out of DOM)
  const detectCanvasRef = useRef(null);
  const detectCtxRef = useRef(null);
  const [presentedTime, setPresentedTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");

  const [swingStart, setSwingStart] = useState(null);
  const [swingContact, setSwingContact] = useState(null);
  const [pitchContact, setPitchContact] = useState(null);

  const [flashStartFrame, setFlashStartFrame] = useState(null);
  const [durationFrames, setDurationFrames] = useState(null);

  const infoLabel = (metadata?.label || "").trim();
  const tagMode = useMemo(() => getTagMode(infoLabel), [infoLabel]);
  const isMatchupPlayback = tagMode === "matchup";
  const showHudOverlay = !isMatchupPlayback; // keep the original HUD for tagging

  const frame = useMemo(() => timeToFrame(presentedTime, fps), [presentedTime, fps]);

  // swing time in ms = (contactFrame - flashStartFrame) * (1000 / fps)
  const swingTimeMs = useMemo(() => {
    if (!Number.isFinite(flashStartFrame) || !Number.isFinite(durationFrames)) return null;
    const contactFrameApprox = Math.max(0, durationFrames - 1);
    const frames = Math.max(0, contactFrameApprox - flashStartFrame);
    return Math.round(frames * (1000 / fps));
  }, [flashStartFrame, durationFrames, fps]);

  const matchupFooterText = useMemo(() => {
    if (!isMatchupPlayback) return infoLabel;
    if (Number.isFinite(swingTimeMs)) return `${infoLabel} | Swing Time: ${swingTimeMs} ms`;
    return infoLabel;
  }, [infoLabel, isMatchupPlayback, swingTimeMs]);

  // ---------- Init detection canvas ----------
  useEffect(() => {
    // reset detection whenever source changes
    setFlashStartFrame(null);
    setDurationFrames(null);
    if (!detectCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = 64;  // small downscale for fast reads
      c.height = 36;
      detectCanvasRef.current = c;
      detectCtxRef.current = c.getContext("2d", { willReadFrequently: true });
    }
  }, [source]);

  // ---------- On loadedmetadata: get duration for frame math ----------
  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setDurationFrames(timeToFrame(v.duration || 0, fps));
  }, [fps]);

  // ---------- Tick while playing (also run flash detection) ----------
  useEffect(() => {
    let id;
    if (videoRef.current) {
      // Always keep time updated while playing
      if (isPlaying) {
        id = setInterval(() => {
          const v = videoRef.current;
          if (!v) return;
          const t = v.currentTime || 0;
          setPresentedTime(t);

          // Flash detection only in matchup playback and only until found
          if (isMatchupPlayback && flashStartFrame == null && detectCtxRef.current) {
            try {
              // Draw current frame to tiny canvas
              detectCtxRef.current.drawImage(v, 0, 0, detectCanvasRef.current.width, detectCanvasRef.current.height);
              if (isYellowishFrame(detectCtxRef.current, detectCanvasRef.current.width, detectCanvasRef.current.height)) {
                setFlashStartFrame(timeToFrame(t, fps));
              }
            } catch {
              // ignore draw errors (cross-origin shouldn't happen for blob URLs)
            }
          }
        }, 1000 / fps);
      }
    }
    return () => clearInterval(id);
  }, [isPlaying, fps, isMatchupPlayback, flashStartFrame]);

  // ---------- Playback controls ----------
  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused || v.ended) {
        await v.play();
        setIsPlaying(true);
      } else {
        v.pause();
        setIsPlaying(false);
      }
    } catch {
      setErr("Autoplay blocked. Click once, then retry.");
    }
  }, []);

  const stepFrame = useCallback((delta) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setIsPlaying(false);
    const newTime = (v.currentTime || 0) + delta / fps;
    v.currentTime = Math.max(0, newTime);
    setPresentedTime(v.currentTime);
  }, [fps]);

  // ---------- Tagging actions ----------
  const tagPitchContact = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setPitchContact(f);
    setStatus(`Pitch contact set @ frame ${f}`);
    if (onTagPitchContact) onTagPitchContact(f);
  }, [fps, presentedTime, onTagPitchContact]);

  const tagSwingStart = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setSwingStart(f);
    if (onTagSwing) onTagSwing({ startFrame: f, contactFrame: swingContact ?? null });
  }, [fps, presentedTime, swingContact, onTagSwing]);

  const tagSwingContact = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setSwingContact(f);
    if (onTagSwing) onTagSwing({ startFrame: swingStart ?? null, contactFrame: f });
  }, [fps, presentedTime, swingStart, onTagSwing]);

  // ---------- Styles ----------
  const BTN_S = { fontSize: 12, padding: "4px 6px", borderRadius: 4 };
  const LABEL_S = { fontSize: 12, alignSelf: "center", opacity: 0.85 };

  // ---------- Render ----------
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8, padding: 8 }}>
      {/* ==== Video ==== */}
      <div style={{ position: "relative", flex: "0 1 auto", background: "#000", border: "1px solid #ddd" }}>
        {source ? (
          <>
            <video
              ref={videoRef}
              src={source}
              playsInline
              controls
              onLoadedMetadata={onLoadedMetadata}
              style={{
                width: "100%",
                maxHeight: "60vh",
                objectFit: "contain",
                background: "#000",
              }}
            />
            {/* Matchup footer: ALWAYS visible in matchup mode; now with Swing Time appended */}
            {isMatchupPlayback && <FooterBar text={matchupFooterText} />}
          </>
        ) : (
          <div style={{ color: "#999", display: "grid", placeItems: "center", height: "200px" }}>
            Load a video to tag.
          </div>
        )}

        {/* Original small HUD for tagging (not for matchup playback) */}
        {showHudOverlay && source && (
          <div
            style={{
              position: "absolute",
              left: 8,
              top: 8,
              padding: "6px 8px",
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              fontSize: 12,
              borderRadius: 6,
              pointerEvents: "none",
            }}
          >
            <div>{infoLabel}</div>
            <div>t={presentedTime.toFixed(2)}s • f={frame}</div>
          </div>
        )}
      </div>

      {/* ==== Controls ==== */}
      <div style={{ borderTop: "1px solid #ddd", paddingTop: 8, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={BTN_S} onClick={() => stepFrame(-1)} disabled={!source}>◀︎ 1f</button>
          <button style={BTN_S} onClick={togglePlay} disabled={!source}>{isPlaying ? "Pause" : "Play"}</button>
          <button style={BTN_S} onClick={() => stepFrame(1)} disabled={!source}>1f ▶︎</button>
          <div style={{ marginLeft: "auto", opacity: 0.75, fontSize: 12 }}>{status}</div>
        </div>

        {(tagMode === "pitch" || tagMode === "both") && (
          <div style={{ display: "flex", gap: 6 }}>
            <span style={LABEL_S}><strong>Pitch</strong></span>
            <button style={BTN_S} onClick={tagPitchContact} disabled={!source}>Set Contact @ f{frame}</button>
          </div>
        )}

        {(tagMode === "swing" || tagMode === "both") && (
          <div style={{ display: "flex", gap: 6 }}>
            <span style={LABEL_S}><strong>Swing</strong></span>
            <button style={BTN_S} onClick={tagSwingStart} disabled={!source}>Set Start</button>
            <button style={BTN_S} onClick={tagSwingContact} disabled={!source}>Set Contact</button>
          </div>
        )}

        {!!err && <div style={{ color: "crimson", fontSize: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
