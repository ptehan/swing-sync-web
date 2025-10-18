// src/components/MatchupSimulator.jsx
import React, { useState, useMemo } from "react";
import {
  getPitchClipBlob,
  getSwingClipBlob,
  saveMatchupClip,
  listMatchupClipKeys,
} from "../utils/dataModel";

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- EXPORT FRAME AT SWING START ----------
async function exportPitcherSwingStartFrame(pitchBlob, swingBlob, pitcherName) {
  try {
    const pitchVideo = document.createElement("video");
    const swingVideo = document.createElement("video");
    pitchVideo.src = URL.createObjectURL(pitchBlob);
    swingVideo.src = URL.createObjectURL(swingBlob);
    pitchVideo.crossOrigin = "anonymous";
    swingVideo.crossOrigin = "anonymous";

    await Promise.all([
      new Promise((r) => (pitchVideo.onloadedmetadata = r)),
      new Promise((r) => (swingVideo.onloadedmetadata = r)),
    ]);

    // compute when swing starts in pitch timeline
    const diff = Math.max(pitchVideo.duration - swingVideo.duration, 0);
    pitchVideo.currentTime = diff;

    // wait until frame is fully decoded
    await new Promise((resolve) => {
      pitchVideo.onseeked = () => {
        const waitDecode = () => {
          if (pitchVideo.readyState >= 4) resolve();
          else requestAnimationFrame(waitDecode);
        };
        waitDecode();
      };
    });

    const canvas = document.createElement("canvas");
    canvas.width = pitchVideo.videoWidth;
    canvas.height = pitchVideo.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(pitchVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, `${pitcherName}_swing_start_frame.png`);
        } else {
          throw new Error("Failed to render canvas frame.");
        }
      },
      "image/png",
      1.0
    );

    URL.revokeObjectURL(pitchVideo.src);
    URL.revokeObjectURL(swingVideo.src);
  } catch (err) {
    console.error("exportPitcherSwingStartFrame failed", err);
    throw err;
  }
}

// ---------- render ----------
async function renderMatchup(pitchBlob, swingBlob, info, fps = 30) {
  const pitchVideo = document.createElement("video");
  const swingVideo = document.createElement("video");
  pitchVideo.src = URL.createObjectURL(pitchBlob);
  swingVideo.src = URL.createObjectURL(swingBlob);
  pitchVideo.muted = swingVideo.muted = true;
  pitchVideo.playsInline = swingVideo.playsInline = true;

  await Promise.all([
    new Promise((r) => (pitchVideo.onloadeddata = r)),
    new Promise((r) => (swingVideo.onloadeddata = r)),
  ]);

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

  const targetTotalWidth = 960;
  const totalOriginalWidth = pitchVideo.videoWidth + swingVideo.videoWidth;
  const scale = Math.min(targetTotalWidth / totalOriginalWidth, 1);

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
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 10000000,
  });
  recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
  const done = new Promise((r) => (recorder.onstop = r));
  recorder.start();

  const titleSec = 5;
  const freezeStartSec = 2;
  const freezeEndSec = 2;
  const diff = Math.max(pitchVideo.duration - swingVideo.duration, 0);

  let startedPitch = false;
  let startedSwing = false;
  let endedPitch = false;
  let endedSwing = false;
  let holdFinal = false;
  let finalFrameTime = 0;
  let replaying = false;

  // ✅ Corrected swing duration calculation
  const frames =
    info.contactFrame != null && info.startFrame != null
      ? info.contactFrame - info.startFrame + 1
      : 0;
  const swingDurationSeconds = frames / fps;
  const trueSwingDuration = swingDurationSeconds.toFixed(3);

  const titleLines = [
    `Hitter: ${info.hitterName}`,
    info.swingDesc ? `Swing: ${info.swingDesc}` : "",
    `Pitcher: ${info.pitcherName}`,
    info.pitchDesc ? `Pitch: ${info.pitchDesc}` : "",
    `Swing Duration: ${trueSwingDuration}s`,
  ].filter(Boolean);

  const startTime = performance.now();

  const draw = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    ctx.clearRect(0, 0, width, height);

    // ---- TITLE ----
    if (!replaying && elapsed < titleSec) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      const fontSize = Math.max(14, Math.floor(height / 28));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "black";
      ctx.fillStyle = "white";
      const lineHeight = fontSize * 1.5;
      const totalTextHeight = lineHeight * titleLines.length;
      const startY = height / 2 - totalTextHeight / 2;
      titleLines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        ctx.strokeText(line, width / 2, y);
        ctx.fillText(line, width / 2, y);
      });
      requestAnimationFrame(draw);
      return;
    }

    // ---- FROZEN START ----
    if (!replaying && elapsed < titleSec + freezeStartSec) {
      if (pitchFirst.complete) ctx.drawImage(pitchFirst, 0, 0, pitchW, height);
      if (swingFirst.complete)
        ctx.drawImage(swingFirst, pitchW, 0, swingW, height);
      requestAnimationFrame(draw);
      return;
    }

    const playTime = elapsed - (titleSec + freezeStartSec);

    if (!startedPitch) {
      pitchVideo.playbackRate = replaying ? 0.25 : 1;
      pitchVideo.play().catch(() => {});
      startedPitch = true;
    }
    if (!startedSwing && playTime >= diff) {
      swingVideo.playbackRate = replaying ? 0.25 : 1;
      swingVideo.play().catch(() => {});
      startedSwing = true;
    }

    ctx.drawImage(pitchVideo, 0, 0, pitchW, height);
    if (startedSwing && !endedSwing) {
      ctx.fillStyle = "rgba(255,255,0,0.35)";
      ctx.fillRect(0, 0, pitchW, height);
    }
    ctx.drawImage(swingVideo, pitchW, 0, swingW, height);

    endedPitch = pitchVideo.ended;
    endedSwing = swingVideo.ended;

    if (endedPitch && endedSwing) {
      if (!holdFinal) {
        holdFinal = true;
        finalFrameTime = performance.now();
      }

      const sinceFinal = (performance.now() - finalFrameTime) / 1000;
      if (sinceFinal < freezeEndSec) {
        requestAnimationFrame(draw);
        return;
      }

      if (!replaying) {
        replaying = true;
        startedPitch = false;
        startedSwing = false;
        endedPitch = false;
        endedSwing = false;
        holdFinal = false;

        pitchVideo.currentTime = 0;
        swingVideo.currentTime = 0;
        pitchVideo.playbackRate = 0.25;
        swingVideo.playbackRate = 0.25;

        const replayDiff = diff * 4;
        const replayStart = performance.now();
        const replayHoldExtra = 1.5;

        const overlayFont = Math.max(14, Math.floor(height / 25));
        ctx.font = `bold ${overlayFont}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        let replayFinalTime = 0;
        let replayHolding = false;

        const replayDraw = () => {
          const elapsedReplay = (performance.now() - replayStart) / 1000;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(pitchVideo, 0, 0, pitchW, height);

          if (!startedSwing && elapsedReplay >= replayDiff) {
            swingVideo.play().catch(() => {});
            startedSwing = true;
          }
          if (startedSwing && !endedSwing) {
            ctx.fillStyle = "rgba(255,255,0,0.35)";
            ctx.fillRect(0, 0, pitchW, height);
          }
          ctx.drawImage(swingVideo, pitchW, 0, swingW, height);

          ctx.lineWidth = 4;
          ctx.strokeStyle = "black";
          ctx.fillStyle = "white";
          ctx.strokeText("REPLAY – 25% SPEED", width / 2, 20);
          ctx.fillText("REPLAY – 25% SPEED", width / 2, 20);

          endedPitch = pitchVideo.ended;
          endedSwing = swingVideo.ended;

          if (endedPitch && endedSwing) {
            if (!replayHolding) {
              replayHolding = true;
              replayFinalTime = performance.now();
            }
            const sinceReplayEnd = (performance.now() - replayFinalTime) / 1000;
            if (sinceReplayEnd >= replayHoldExtra) {
              recorder.stop();
              return;
            }
          }

          requestAnimationFrame(replayDraw);
        };

        pitchVideo.play().catch(() => {});
        requestAnimationFrame(replayDraw);
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
        contactFrame: swing?.contactFrame,
        startFrame: swing?.startFrame,
      };

      const blob = await renderMatchup(pitchBlob, swingBlob, info);
      const videoKey = `${selectedHitter}_${selectedSwingIndex}_vs_${selectedPitcher}_${selectedPitchIndex}_sidebyside`;

      await saveMatchupClip(videoKey, blob, {
        hitterName: selectedHitter,
        swingIndex: selectedSwingIndex,
        pitcherName: selectedPitcher,
        pitchIndex: selectedPitchIndex,
        labelType: "sidebyside",
        description: `${swing?.description || ""} vs ${pitch?.description || ""}`,
      });

      const fresh = await listMatchupClipKeys();
      setMatchups(fresh);

      downloadBlob(blob, `${selectedHitter}_vs_${selectedPitcher}.webm`);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPitchStart() {
    if (
      !selectedPitcher ||
      selectedPitchIndex == null ||
      !selectedHitter ||
      selectedSwingIndex == null
    ) {
      setError("Select both pitch and swing first.");
      return;
    }
    try {
      setBusy(true);
      const pitch = pitcherPitches[selectedPitchIndex];
      const swing = swings.find(
        (s, i) => s.hitterName === selectedHitter && i === selectedSwingIndex
      );
      const [pitchBlob, swingBlob] = await Promise.all([
        getPitchClipBlob(pitch.videoKey),
        getSwingClipBlob(swing.videoKey),
      ]);
      await exportPitcherSwingStartFrame(pitchBlob, swingBlob, selectedPitcher);
    } catch (e) {
      console.error(e);
      setError("Failed to export swing-start frame.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Matchup Simulator</h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 400,
        }}
      >
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
        <button onClick={handleExportPitchStart} disabled={busy}>
          Export Pitcher Swing-Start Frame
        </button>
      </div>

      {error && <div style={{ color: "crimson" }}>{error}</div>}
      {busy && <div>Working…</div>}
    </div>
  );
}
