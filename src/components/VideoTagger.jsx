// src/components/VideoTagger.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

const DEFAULT_FPS = 30;

function timeToFrame(t, fps) {
  return Math.round(t * fps);
}
function getTagMode(labelRaw) {
  const label = (labelRaw || "").toLowerCase();
  if (label.startsWith("matchup:")) return "matchup";
  if (/(^|\s)(pitch|pitching)\b/.test(label)) return "pitch";
  if (/(^|\s)(swing|hitting|hitter)\b/.test(label)) return "swing";
  return "both";
}

function FooterBar({ text }) {
  if (!text) return null;
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
        fontWeight: 600,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}

export default function VideoTagger({
  source,
  metadata = {},
  fps = DEFAULT_FPS,
  onTagSwing,
  onTagPitchContact,
  taggable = false, // NEW PROP
}) {
  const videoRef = useRef(null);

  const [presentedTime, setPresentedTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");

  const infoLabel = (metadata?.label || "").trim();
  const tagMode = useMemo(() => getTagMode(infoLabel), [infoLabel]);
  const isMatchupPlayback = tagMode === "matchup";

  // now driven by explicit prop, not auto-detect
  const showHudOverlay = taggable;

  const frame = useMemo(
    () => timeToFrame(presentedTime, fps),
    [presentedTime, fps]
  );

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

  const stepFrame = useCallback(
    (delta) => {
      const v = videoRef.current;
      if (!v) return;
      v.pause();
      setIsPlaying(false);
      const newTime = (v.currentTime || 0) + delta / fps;
      v.currentTime = Math.max(0, newTime);
      setPresentedTime(v.currentTime);
    },
    [fps]
  );

  const tagPitchContact = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    setStatus(`Pitch contact @ f${f}`);
    if (onTagPitchContact) onTagPitchContact(f);
  }, [fps, presentedTime, onTagPitchContact]);

  const tagSwingStart = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    if (onTagSwing) onTagSwing({ startFrame: f, contactFrame: null });
  }, [fps, presentedTime, onTagSwing]);

  const tagSwingContact = useCallback(() => {
    const f = timeToFrame(videoRef.current?.currentTime ?? presentedTime, fps);
    if (onTagSwing) onTagSwing({ startFrame: null, contactFrame: f });
  }, [fps, presentedTime, onTagSwing]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 8,
        padding: 8,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: "0 1 auto",
          background: "#000",
          border: "1px solid #ddd",
        }}
      >
        {source ? (
          <>
            <video
              ref={videoRef}
              src={source}
              playsInline
              controls
              style={{
                width: "100%",
                maxHeight: "60vh",
                objectFit: "contain",
                background: "#000",
              }}
            />
            {isMatchupPlayback && <FooterBar text={infoLabel} />}
          </>
        ) : (
          <div
            style={{
              color: "#999",
              display: "grid",
              placeItems: "center",
              height: "200px",
            }}
          >
            Load a video to tag.
          </div>
        )}
      </div>

      {showHudOverlay && source && (
        <div
          style={{
            borderTop: "1px solid #ddd",
            paddingTop: 8,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
              onClick={() => stepFrame(-1)}
              disabled={!source}
            >
              ◀︎1f
            </button>
            <button
              type="button"
              style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
              onClick={togglePlay}
              disabled={!source}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
              onClick={() => stepFrame(1)}
              disabled={!source}
            >
              1f▶︎
            </button>
            <div style={{ opacity: 0.75, fontSize: 12 }}>{status}</div>
          </div>

          {(tagMode === "pitch" || tagMode === "both") && (
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                <strong>Pitch</strong>
              </span>
              <button
                type="button"
                style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
                onClick={tagPitchContact}
                disabled={!source}
              >
                Set Contact @ f{frame}
              </button>
            </div>
          )}

          {(tagMode === "swing" || tagMode === "both") && (
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                <strong>Swing</strong>
              </span>
              <button
                type="button"
                style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
                onClick={tagSwingStart}
                disabled={!source}
              >
                Set Start
              </button>
              <button
                type="button"
                style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4 }}
                onClick={tagSwingContact}
                disabled={!source}
              >
                Set Contact
              </button>
            </div>
          )}

          {!!err && <div style={{ color: "crimson", fontSize: 12 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
