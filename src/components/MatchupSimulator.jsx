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

    const diff = Math.max(pitchVideo.duration - swingVideo.duration, 0);
    pitchVideo.currentTime = diff;

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
        if (blob) downloadBlob(blob, `${pitcherName}_swing_start_frame.png`);
        else throw new Error("Failed to render canvas frame.");
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
  let swingStartTime = 0;

  const frames = (info.contactFrame ?? 0) - (info.startFrame ?? 0) + 1;
  const swingDurationSeconds = frames / 30;
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
      swingStartTime = performance.now();
    }

    ctx.drawImage(pitchVideo, 0, 0, pitchW, height);

    if (startedSwing) {
      const elapsedSinceSwingStart = (performance.now() - swingStartTime) / 1000;
      const flashDuration = 3 / fps;
      if (elapsedSinceSwingStart <= flashDuration) {
        ctx.fillStyle = "rgba(255,255,0,0.35)";
        ctx.fillRect(0, 0, pitchW, height);
      }
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
        let replaySwingStartTime = 0;

        const replayDraw = () => {
          const elapsedReplay = (performance.now() - replayStart) / 1000;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(pitchVideo, 0, 0, pitchW, height);

          if (!startedSwing && elapsedReplay >= replayDiff) {
            swingVideo.play().catch(() => {});
            startedSwing = true;
            replaySwingStartTime = performance.now();
          }

          if (startedSwing) {
            const elapsedSinceSwingStart =
              (performance.now() - replaySwingStartTime) / 1000;
            const flashDuration = 3 / fps;
            if (elapsedSinceSwingStart <= flashDuration) {
              ctx.fillStyle = "rgba(255,255,0,0.35)";
              ctx.fillRect(0, 0, pitchW, height);
            }
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

  // --- main video blob ---
  const blob = new Blob(chunks, { type: "video/webm" });

  // --- attempt MP4 conversion if supported ---
  let finalBlob = blob;
  if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
    try {
      console.log("✅ Browser supports MP4; converting...");
      const video = document.createElement("video");
      video.src = URL.createObjectURL(blob);
      await video.play().catch(() => {});
      const stream2 = video.captureStream();
      const rec2 = new MediaRecorder(stream2, {
        mimeType: "video/mp4;codecs=avc1",
      });
      const mp4Chunks = [];
      rec2.ondataavailable = (e) => e.data && mp4Chunks.push(e.data);
      const done2 = new Promise((r) => (rec2.onstop = r));
      rec2.start();
      await new Promise((r) => setTimeout(r, blob.size / 20000));
      rec2.stop();
      await done2;
      finalBlob = new Blob(mp4Chunks, { type: "video/mp4" });
    } catch (err) {
      console.warn("MP4 conversion failed, keeping WebM", err);
    }
  }

  URL.revokeObjectURL(pitchVideo.src);
  URL.revokeObjectURL(swingVideo.src);
  return finalBlob;
}
