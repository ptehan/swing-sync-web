// src/components/MatchupSimulator.jsx
import React, { useMemo, useState } from "react";
import { getPitchClipBlob } from "../utils/dataModel";

const FPS = 30;
const FLASH_FRAMES = 3;

function chooseBestMime() {
  if (!window.MediaRecorder) return "";
  const cands = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

async function loadClipVideo(clipBlob) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const url = URL.createObjectURL(clipBlob);
  video.src = url;

  await new Promise((resolve, reject) => {
    const ok = () => resolve();
    const ko = () => reject(new Error("Failed to load saved clip metadata."));
    video.addEventListener("loadedmetadata", ok, { once: true });
    video.addEventListener("error", ko, { once: true });
  });

  const width = Math.max(2, video.videoWidth || 2);
  const height = Math.max(2, video.videoHeight || 2);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("Saved clip has no readable duration.");
  }

  return { video, url, width, height, duration };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawLabels(ctx, width, height, hitterName, pitcherName) {
  const paddingX = Math.round(Math.max(10, width * 0.015));
  const paddingY = paddingX;
  const gapY = Math.round(paddingX * 0.7);
  const fontSize = Math.max(14, Math.round(width * 0.028));
  const lineHeight = Math.round(fontSize * 1.2);

  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.textBaseline = "top";

  const line1 = `Hitter: ${hitterName || "-"}`;
  const line2 = `Pitcher: ${pitcherName || "-"}`;

  const textW = Math.ceil(Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width));
  const plateW = textW + paddingX * 2;
  const plateH = lineHeight * 2 + paddingY * 2 + gapY;
  const x = paddingX;
  const y = paddingY;

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = "#000";
  drawRoundedRect(ctx, x - 4, y - 4, plateW + 8, plateH + 8, 10);
  ctx.fill();

  ctx.globalAlpha = 1.0;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.fillText(line1, x + paddingX, y + paddingY);
  ctx.fillText(line2, x + paddingX, y + paddingY + lineHeight + gapY);
  ctx.restore();
}

async function renderOverlayClipDeterministic(
  clipBlob,
  { fps, flashStart, len = FLASH_FRAMES, hitterName = "", pitcherName = "" }
) {
  const mime = chooseBestMime();
  if (!mime) throw new Error("Recording not supported in this browser.");

  const { video, url, width, height, duration } = await loadClipVideo(clipBlob);
  const totalFrames = Math.max(1, Math.round(duration * fps));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const stream = canvas.captureStream(fps);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("MediaRecorder failed to start.");
  }

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e?.data && e.data.size) chunks.push(e.data);
  };
  const waitStop = () => new Promise((res) => (recorder.onstop = () => res()));

  recorder.start();

  const seekTo = (t) =>
    new Promise((resolve, reject) => {
      let to;
      const done = () => {
        clearTimeout(to);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onErr);
        resolve();
      };
      const onSeeked = () => done();
      const onErr = () => {
        clearTimeout(to);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onErr);
        reject(new Error("Seek failed."));
      };
      to = setTimeout(done, 1500);
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onErr, { once: true });
      const safeT = Math.min(Math.max(0, t), Math.max(0, duration - 1 / (fps * 2)));
      video.currentTime = safeT;
    });

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    await seekTo(t);

    ctx.drawImage(video, 0, 0, width, height);

    if (i >= flashStart && i < flashStart + len) {
      ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
      ctx.fillRect(0, 0, width, height);
    }

    drawLabels(ctx, width, height, hitterName, pitcherName);

    await new Promise((r) => setTimeout(r, 0));
  }

  try { recorder.requestData(); } catch {}
  try { recorder.stop(); } catch {}
  await waitStop();

  URL.revokeObjectURL(url);

  const out = new Blob(chunks, { type: mime });
  if (!out || !out.size) throw new Error("Overlay render produced an empty clip.");
  return out;
}

async function exportSwingStartPNG(
  clipBlob,
  { fps, flashStart, hitterName = "", pitcherName = "", showFlash = false }
) {
  const { video, url, width, height, duration } = await loadClipVideo(clipBlob);
  const t = Math.min(Math.max(0, flashStart / fps), Math.max(0, duration - 1 / (fps * 2)));

  await new Promise((resolve, reject) => {
    let to;
    const ok = () => {
      clearTimeout(to);
      video.removeEventListener("seeked", ok);
      video.removeEventListener("error", ko);
      resolve();
    };
    const ko = () => {
      clearTimeout(to);
      video.removeEventListener("seeked", ok);
      video.removeEventListener("error", ko);
      reject(new Error("Seek failed."));
    };
    to = setTimeout(ok, 1500);
    video.addEventListener("seeked", ok, { once: true });
    video.addEventListener("error", ko, { once: true });
    video.currentTime = t;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(video, 0, 0, width, height);
  if (showFlash) {
    ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
    ctx.fillRect(0, 0, width, height);
  }
  drawLabels(ctx, width, height, hitterName, pitcherName);

  URL.revokeObjectURL(url);

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png", 0.92));
  if (!blob || !blob.size) throw new Error("Failed to create PNG.");
  return blob;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MatchupSimulator({
  hitters,
  swings,
  pitchers,
  pitches,
  requestLoadVideoInTagger,
}) {
  const [selectedHitter, setSelectedHitter] = useState("");
  const [selectedSwingIndex, setSelectedSwingIndex] = useState(null);
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [selectedPitchIndex, setSelectedPitchIndex] = useState(null);

  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [pngShowFlash, setPngShowFlash] = useState(false);

  const pitcherPitches = useMemo(
    () => pitches.filter((p) => p.pitcherName === selectedPitcher),
    [pitches, selectedPitcher]
  );

  function computeTimings(swing, pitch) {
    const originalContact = Number(pitch.contactFrame);
    if (!Number.isFinite(originalContact) || originalContact < 0) {
      throw new Error("Invalid pitch contact frame.");
    }
    const trimStartFrames = Number.isFinite(pitch.trimStartFrames)
      ? pitch.trimStartFrames
      : Math.max(0, originalContact - 2 * FPS);

    const contactInClip = originalContact - trimStartFrames;
    const clipFrames = contactInClip + 1;

    let swingFrames;
    if (Number.isFinite(swing.startFrame) && Number.isFinite(swing.contactFrame)) {
      swingFrames = swing.contactFrame - swing.startFrame;
    } else if (Number.isFinite(swing.swingTime)) {
      swingFrames = Math.round(swing.swingTime * FPS);
    } else {
      throw new Error("Swing missing timing. Tag both frames or enter a swing time.");
    }
    if (!Number.isFinite(swingFrames) || swingFrames < 0) {
      throw new Error("Swing timing invalid.");
    }

    let flashStartFrame = contactInClip - swingFrames;
    const maxStart = Math.max(0, clipFrames - FLASH_FRAMES);
    if (!Number.isFinite(flashStartFrame)) flashStartFrame = 0;
    flashStartFrame = Math.max(0, Math.min(flashStartFrame, maxStart));

    // 🔍 DEBUG LOG
    console.log("[computeTimings]", {
      originalContact,
      contactInClip,
      swingFrames,
      flashStartFrame
    });

    return {
      originalContact,
      trimStartFrames,
      contactInClip,
      clipFrames,
      swingFrames,
      flashStartFrame,
    };
  }

  const generateClip = async () => {
    setError("");
    setInfo("");

    if (typeof requestLoadVideoInTagger !== "function") {
      setError("Right-side player not wired in App.jsx (requestLoadVideoInTagger missing).");
      return;
    }
    if (
      !selectedHitter ||
      selectedSwingIndex === null ||
      selectedSwingIndex === "" ||
      !selectedPitcher ||
      selectedPitchIndex === null ||
      selectedPitchIndex === ""
    ) {
      setError("Pick a swing and a pitch first.");
      return;
    }

    const hitterSwings = swings.filter((s) => s.hitterName === selectedHitter);
    const swing = hitterSwings[selectedSwingIndex];
    const pitch = pitcherPitches[selectedPitchIndex];
    if (!swing) return setError("Selected swing not found.");
    if (!pitch) return setError("Selected pitch not found.");
    if (!pitch.videoKey) return setError("Pitch has no saved clip key.");

    setBusy(true);
    try {
      const t = computeTimings(swing, pitch);
      const clipBlob = await getPitchClipBlob(pitch.videoKey);
      if (!clipBlob) return setError("Saved pitch clip not found in IndexedDB.");

      const composed = await renderOverlayClipDeterministic(clipBlob, {
        fps: FPS,
        flashStart: t.flashStartFrame,
        len: FLASH_FRAMES,
        hitterName: selectedHitter,
        pitcherName: selectedPitcher,
      });

      const label = `Matchup: ${selectedHitter} vs ${selectedPitcher}`;
      requestLoadVideoInTagger(composed, label);

      setInfo(
        `Loaded right pane • contactInClip=${t.contactInClip}f, swing=${t.swingFrames}f, flash=${t.flashStartFrame}..${t.flashStartFrame + FLASH_FRAMES - 1}`
      );
    } catch (e) {
      console.error("[MatchupSimulator] generateClip error:", e);
      setError(e?.message || "Failed to render matchup clip.");
    } finally {
      setBusy(false);
    }
  };

  const exportMatchupVideo = async () => {
    setError("");
    if (
      !selectedHitter ||
      selectedSwingIndex === null ||
      selectedSwingIndex === "" ||
      !selectedPitcher ||
      selectedPitchIndex === null ||
      selectedPitchIndex === ""
    ) {
      setError("Pick a swing and a pitch first.");
      return;
    }
    const swing = swings.filter((s) => s.hitterName === selectedHitter)[selectedSwingIndex];
    const pitch = pitcherPitches[selectedPitchIndex];
    if (!swing || !pitch?.videoKey) return setError("Missing swing or saved pitch clip.");

    setBusy(true);
    try {
      const t = computeTimings(swing, pitch);
      const clipBlob = await getPitchClipBlob(pitch.videoKey);
      if (!clipBlob) return setError("Saved pitch clip not found in IndexedDB.");

      const composed = await renderOverlayClipDeterministic(clipBlob, {
        fps: FPS,
        flashStart: t.flashStartFrame,
        len: FLASH_FRAMES,
        hitterName: selectedHitter,
        pitcherName: selectedPitcher,
      });

      const fileBase = `matchup_${selectedHitter.replace(/\s+/g, "_")}_vs_${selectedPitcher.replace(/\s+/g, "_")}`;
      const ext = composed.type.includes("mp4") ? "mp4" : "webm";
      downloadBlob(composed, `${fileBase}.${ext}`);
    } catch (e) {
      console.error("[MatchupSimulator] export video error:", e);
      setError(e?.message || "Failed to export matchup video.");
    } finally {
      setBusy(false);
    }
  };

  const exportSwingStartImageHandler = async () => {
    setError("");
    if (
      !selectedHitter ||
      selectedSwingIndex === null ||
      selectedSwingIndex === "" ||
      !selectedPitcher ||
      selectedPitchIndex === null ||
      selectedPitchIndex === ""
    ) {
      setError("Pick a swing and a pitch first.");
      return;
    }
    const swing = swings.filter((s) => s.hitterName === selectedHitter)[selectedSwingIndex];
    const pitch = pitcherPitches[selectedPitchIndex];
    if (!swing || !pitch?.videoKey) return setError("Missing swing or saved pitch clip.");

    setBusy(true);
    try {
      const t = computeTimings(swing, pitch);
      const clipBlob = await getPitchClipBlob(pitch.videoKey);
      if (!clipBlob) return setError("Saved pitch clip not found in IndexedDB.");

      const png = await exportSwingStartPNG(clipBlob, {
        fps: FPS,
        flashStart: t.flashStartFrame,
        hitterName: selectedHitter,
        pitcherName: selectedPitcher,
        showFlash: pngShowFlash,
      });

      const suffix = pngShowFlash ? "" : "_noflash";
      const fileBase = `swing_start_${selectedHitter.replace(/\s+/g, "_")}_vs_${selectedPitcher.replace(/\s+/g, "_")}_${t.flashStartFrame}f${suffix}`;
      downloadBlob(png, `${fileBase}.png`);
    } catch (e) {
      console.error("[MatchupSimulator] export PNG error:", e);
      setError(e?.message || "Failed to export swing-start image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2>Matchup Simulator</h2>

      <div style={{ marginBottom: "1rem", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label>
          Hitter:&nbsp;
          <select
            value={selectedHitter}
            onChange={(e) => {
              setSelectedHitter(e.target.value);
              setSelectedSwingIndex(null);
            }}
          >
            <option value="">-- select hitter --</option>
            {hitters.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </label>

        {selectedHitter && (
          <select
            value={selectedSwingIndex ?? ""}
            onChange={(e) => setSelectedSwingIndex(Number(e.target.value))}
          >
            <option value="">-- select swing --</option>
            {swings
              .filter((s) => s.hitterName === selectedHitter)
              .map((s, i) => (
                <option key={i} value={i}>
                  Swing {i + 1}{" "}
                  {Number.isFinite(s.startFrame) && Number.isFinite(s.contactFrame)
                    ? `(frames ${s.startFrame}→${s.contactFrame})`
                    : Number.isFinite(s.swingTime)
                    ? `(time ${Number(s.swingTime).toFixed(2)}s)`
                    : `(time —)`}
                </option>
              ))}
          </select>
        )}
      </div>

      <div style={{ marginBottom: "1rem", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label>
          Pitcher:&nbsp;
          <select
            value={selectedPitcher}
            onChange={(e) => {
              setSelectedPitcher(e.target.value);
              setSelectedPitchIndex(null);
            }}
          >
            <option value="">-- select pitcher --</option>
            {pitchers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {selectedPitcher && (
          <select
            value={selectedPitchIndex ?? ""}
            onChange={(e) => setSelectedPitchIndex(Number(e.target.value))}
          >
            <option value="">-- select pitch --</option>
            {pitcherPitches.map((pitch, i) => (
              <option key={`${pitch.videoKey || "nosave"}-${i}`} value={i}>
                Pitch {i + 1} (contact {pitch.contactFrame}) {pitch.videoKey ? "• saved" : "• no clip"}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={generateClip} disabled={busy}>Generate Matchup Clip (Right Pane)</button>
        <button onClick={exportMatchupVideo} disabled={busy}>Export Matchup Video</button>
        <button onClick={exportSwingStartImageHandler} disabled={busy}>Export Swing-Start Image</button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={pngShowFlash}
            onChange={(e) => setPngShowFlash(e.target.checked)}
          />
          Yellow flash on PNG
        </label>
      </div>

      {!!info && <div style={{ color: "#0a7", fontSize: 13, marginTop: 8 }}>{info}</div>}
      {!!error && <div style={{ color: "crimson", fontSize: 13, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
