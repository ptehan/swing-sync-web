// src/components/MatchupSimulator.jsx
import React, { useState, useMemo } from "react";
import {
  getPitchClipBlob,
  getSwingClipBlob,
  saveMatchupClip,
} from "../utils/dataModel";

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- render ----------
async function renderMatchup(pitchBlob, swingBlob, info, fps = 30) {
  const pitchVideo = document.createElement("video");
  const swingVideo = document.createElement("video");
  pitchVideo.src = URL.createObjectURL(pitchBlob);
  swingVideo.src = URL.createObjectURL(swingBlob);
  pitchVideo.muted = swingVideo.muted = true;
  pitchVideo.playsInline = swingVideo.playsInline = true;

  // Wait for metadata
  await Promise.all([
    new Promise((r) => (pitchVideo.onloadeddata = r)),
    new Promise((r) => (swingVideo.onloadeddata = r)),
  ]);

  // Seek both to first frame and cache bitmaps
  pitchVideo.currentTime = 0;
  swingVideo.currentTime = 0;
  await Promise.all([
    new Promise((r) => (pitchVideo.onseeked = r)),
    new Promise((r) => (swingVideo.onseeked = r)),
  ]);

  const tmpCanvas = document.createElement("canvas");
  const tmpCtx = tmpCanvas.getContext("2d");
  tmpCanvas.width = Math.max(pitchVideo.videoWidth, swingVideo.videoWidth);
  tmpCanvas.height = Math.max(pitchVideo.videoHeight, swingVideo.videoHeight);

  tmpCtx.drawImage(pitchVideo, 0, 0);
  const pitchFirst = new Image();
  pitchFirst.src = tmpCanvas.toDataURL("image/png");

  tmpCtx.clearRect(0, 0, tmpCanvas.width, tmpCanvas.height);
  tmpCtx.drawImage(swingVideo, 0, 0);
  const swingFirst = new Image();
  swingFirst.src = tmpCanvas.toDataURL("image/png");

  // scale setup
  const scale = Math.min(320 / pitchVideo.videoWidth, 180 / pitchVideo.videoHeight, 1);
  const pitchW = Math.floor(pitchVideo.videoWidth * scale);
  const swingW = Math.floor(swingVideo.videoWidth * scale);
  const height = Math.max(
    Math.floor(pitchVideo.videoHeight * scale),
    Math.floor(swingVideo.videoHeight * scale)
  );
  const width = pitchW + swingW;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const stream = canvas.captureStream(fps);
  const chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
  const done = new Promise((r) => (recorder.onstop = r));
  recorder.start();

  const titleSec = 2;
  const freezeStartSec = 2;
  const freezeEndSec = 2;
  const diff = Math.max(pitchVideo.duration - swingVideo.duration, 0);

  let startedPitch = false;
  let startedSwing = false;
  let endedPitch = false;
  let endedSwing = false;
  let holdFinal = false;
  let finalFrameTime = 0;

  const titleLines = [
    `Hitter: ${info.hitterName}`,
    info.swingDesc ? `Swing: ${info.swingDesc}` : "",
    `Pitcher: ${info.pitcherName}`,
    info.pitchDesc ? `Pitch: ${info.pitchDesc}` : "",
  ].filter(Boolean);

  const startTime = performance.now();

  const draw = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    ctx.clearRect(0, 0, width, height);

    // ---- 0–2s: Title ----
    if (elapsed < titleSec) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "white";
      ctx.font = "16px sans-serif";
      titleLines.forEach((line, i) => ctx.fillText(line, 20, 40 + i * 22));
      requestAnimationFrame(draw);
      return;
    }

    // ---- 2–4s: Frozen first frame ----
    if (elapsed < titleSec + freezeStartSec) {
      if (pitchFirst.complete)
        ctx.drawImage(pitchFirst, 0, 0, pitchW, height);
      if (swingFirst.complete)
        ctx.drawImage(swingFirst, pitchW, 0, swingW, height);
      requestAnimationFrame(draw);
      return;
    }

    const playTime = elapsed - (titleSec + freezeStartSec);

    // ---- Start videos ----
    if (!startedPitch) {
      pitchVideo.play().catch(() => {});
      startedPitch = true;
    }
    if (!startedSwing && playTime >= diff) {
      swingVideo.play().catch(() => {});
      startedSwing = true;
    }

    // ---- Draw playback ----
    ctx.drawImage(pitchVideo, 0, 0, pitchW, height);
    if (startedSwing && !endedSwing) {
      ctx.fillStyle = "rgba(255,255,0,0.35)";
      ctx.fillRect(0, 0, pitchW, height);
    }
    ctx.drawImage(swingVideo, pitchW, 0, swingW, height);

    endedPitch = pitchVideo.ended;
    endedSwing = swingVideo.ended;

    // ---- 2s hold after both ended ----
    if (endedPitch && endedSwing) {
      if (!holdFinal) {
        holdFinal = true;
        finalFrameTime = performance.now();
      }
      const sinceFinal = (performance.now() - finalFrameTime) / 1000;
      if (sinceFinal < freezeEndSec) {
        ctx.drawImage(pitchVideo, 0, 0, pitchW, height);
        ctx.drawImage(swingVideo, pitchW, 0, swingW, height);
        requestAnimationFrame(draw);
        return;
      } else {
        recorder.stop();
        return;
      }
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
  await done;

  const blob = new Blob(chunks, { type: "video/webm" });
  URL.revokeObjectURL(pitchVideo.src);
  URL.revokeObjectURL(swingVideo.src);
  return blob;
}

// ---------- UI ----------
export default function MatchupSimulator({
  hitters,
  swings,
  pitchers,
  pitches,
  matchups,
  setMatchups,
}) {
  const [selectedHitter, setSelectedHitter] = useState("");
  const [selectedSwingIndex, setSelectedSwingIndex] = useState(null);
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [selectedPitchIndex, setSelectedPitchIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pitcherPitches = useMemo(
    () => pitches.filter((p) => p.pitcherName === selectedPitcher),
    [pitches, selectedPitcher]
  );

  async function handleRender() {
    if (
      !selectedHitter ||
      selectedSwingIndex == null ||
      !selectedPitcher ||
      selectedPitchIndex == null
    ) {
      setError("Select all options");
      return;
    }

    try {
      setBusy(true);
      setError("");

      const swing = swings.find(
        (s, i) => s.hitterName === selectedHitter && i === selectedSwingIndex
      );
      const pitch = pitcherPitches[selectedPitchIndex];

      const [pitchBlob, swingBlob] = await Promise.all([
        getPitchClipBlob(pitch.videoKey),
        getSwingClipBlob(swing.videoKey),
      ]);

      const info = {
        hitterName: selectedHitter,
        swingDesc: swing?.description || "",
        pitcherName: selectedPitcher,
        pitchDesc: pitch?.description || "",
      };

      const blob = await renderMatchup(pitchBlob, swingBlob, info);
      const videoKey = `${selectedHitter}_${selectedSwingIndex}_vs_${selectedPitcher}_${selectedPitchIndex}_sidebyside`;

      await saveMatchupClip(videoKey, blob);
      downloadBlob(blob, `${selectedHitter}_vs_${selectedPitcher}.webm`);

      setMatchups((prev) => [
        ...prev.filter((m) => m.videoKey !== videoKey),
        {
          hitterName: selectedHitter,
          swingIndex: selectedSwingIndex,
          pitcherName: selectedPitcher,
          pitchIndex: selectedPitchIndex,
          videoKey,
          labelType: "sidebyside",
          createdAt: Date.now(),
        },
      ]);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Matchup Simulator</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
        {/* Hitter */}
        <select
          value={selectedHitter}
          onChange={(e) => {
            setSelectedHitter(e.target.value);
            setSelectedSwingIndex(null);
          }}
          disabled={busy}
        >
          <option value="">-- select hitter --</option>
          {hitters.map((h) => (
            <option key={h.name} value={h.name}>
              {h.name}
            </option>
          ))}
        </select>

        {/* Swing */}
        <select
          value={selectedSwingIndex ?? ""}
          onChange={(e) => setSelectedSwingIndex(Number(e.target.value))}
          disabled={!selectedHitter || busy}
        >
          <option value="">-- select swing --</option>
          {swings
            .filter((s) => s.hitterName === selectedHitter)
            .map((s, i) => (
              <option key={i} value={i}>
                Swing {i + 1}
                {s.description ? ` – ${s.description}` : ""}
              </option>
            ))}
        </select>

        {/* Pitcher */}
        <select
          value={selectedPitcher}
          onChange={(e) => {
            setSelectedPitcher(e.target.value);
            setSelectedPitchIndex(null);
          }}
          disabled={busy}
        >
          <option value="">-- select pitcher --</option>
          {pitchers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Pitch */}
        <select
          value={selectedPitchIndex ?? ""}
          onChange={(e) => setSelectedPitchIndex(Number(e.target.value))}
          disabled={!selectedPitcher || busy}
        >
          <option value="">-- select pitch --</option>
          {pitcherPitches.map((p, i) => (
            <option key={i} value={i}>
              Pitch {i + 1}
              {p.description ? ` – ${p.description}` : ""}
            </option>
          ))}
        </select>

        <button onClick={handleRender} disabled={busy}>
          Render Side-by-Side
        </button>
      </div>

      {error && <div style={{ color: "crimson" }}>{error}</div>}
      {busy && <div>Rendering…</div>}
    </div>
  );
}
