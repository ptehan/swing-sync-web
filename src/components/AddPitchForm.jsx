// src/components/AddPitchForm.jsx
import React, { useState, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { savePitchClip } from "../utils/dataModel";

// Manual frame-by-frame capture with visible frame numbers & encoder drain
async function captureFrames(file, contactFrame, FPS) {
  console.log("[captureFrames] manual stepping start");
  const contactTimeSec = contactFrame / FPS;
  const backtrackSec = 2;
  const startTimeSec = Math.max(0, contactTimeSec - backtrackSec);
  const endTimeSec = contactTimeSec;
  const frameStep = 1 / FPS;
  const frameCount = Math.ceil((endTimeSec - startTimeSec) * FPS) + 1;

  console.log(
    `[captureFrames] start=${startTimeSec.toFixed(3)} end=${endTimeSec.toFixed(
      3
    )} frames=${frameCount}`
  );

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const log = (...args) => console.log("[captureFrames]", ...args);

    video.onloadedmetadata = async () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.font = "40px monospace";
      ctx.fillStyle = "yellow";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "black";

      const stream = canvas.captureStream(FPS);
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        log("complete", blob.size, "bytes");
        if (blob.size < 512) reject(new Error("Empty output"));
        else resolve({ blob, preOffsetMs: 0, postOffsetMs: 0 });
      };

      rec.start();
      log(`recording ${frameCount} frames (~${(frameCount / FPS).toFixed(2)}s)`);

      let frameIndex = 0;
      let finished = false;

      const drawNext = () => {
        if (frameIndex >= frameCount) {
          finished = true;
          log(
            "STOPPING — last painted time =",
            video.currentTime.toFixed(3),
            "expected end =",
            endTimeSec.toFixed(3)
          );
          // wait for encoder drain
          const waitForDrain = () => {
            if (stream.getVideoTracks()[0].readyState === "ended") {
              rec.stop();
              return;
            }
            // small delay before stopping to flush last clusters
            setTimeout(() => {
              log("🛑 stopping recorder (after drain delay)");
              rec.stop();
            }, 300);
          };
          waitForDrain();
          return;
        }

        const t = startTimeSec + frameIndex * frameStep;
        video.currentTime = t;

        video.onseeked = () => {
          const waitForDecode = () => {
            if (video.readyState < 4) {
              requestAnimationFrame(waitForDecode);
              return;
            }
ctx.drawImage(video, 0, 0, w, h);
log("PAINTED frame", frameIndex, "time", t.toFixed(3));
frameIndex++;
requestAnimationFrame(drawNext);

          };
          waitForDecode();
        };
      };

      drawNext();
    };

    video.onerror = () => reject(new Error("Video load failed"));
  });
}

export default function AddPitchForm({
  pitchers,
  onAddPitch,
  constants = { FPS: 30 },
  onClose,
}) {
  const FPS = Number(constants?.FPS) || 30;
  const [pitcher, setPitcher] = useState("");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const [desc, setDesc] = useState("");
  const [frame, setFrame] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setFrame(null);
    setUrl(f ? URL.createObjectURL(f) : null);
    setErr("");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!pitcher || !file || frame == null)
      return setErr("Select pitcher, video, and tag frame");

    try {
      setBusy(true);
      console.log("[AddPitchForm] capture start");
      const { blob, preOffsetMs, postOffsetMs } = await captureFrames(
        file,
        frame,
        FPS
      );
      console.log("[AddPitchForm] final blob size", blob.size);
      const key = `pitch_${pitcher}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      console.log("[AddPitchForm] saving clip", key);
      await savePitchClip(key, blob, desc.trim(), frame);
      onAddPitch(pitcher, {
        contactFrame: frame,
        videoKey: key,
        description: desc.trim(),
        preOffsetMs,
        postOffsetMs,
      });
      alert("Pitch saved!");
      onClose && onClose();
    } catch (e2) {
      console.error("[AddPitchForm] failed", e2);
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <h3>Add Pitch</h3>

      <label>
        Pitcher:
        <select value={pitcher} onChange={(e) => setPitcher(e.target.value)}>
          <option value="">-- Select Pitcher --</option>
          {pitchers.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
      </label>

      <label>
        Pitch Video:
        <input type="file" accept="video/*" onChange={onFile} />
      </label>

      {url && (
        <div>
          <VideoTagger
            source={url}
            metadata={{ label: `Pitch tagging: ${pitcher}` }}
            fps={FPS}
            taggable
            onTagPitchContact={(f) => setFrame(f)}
          />
        </div>
      )}

      {frame != null && <div>Tagged contact={frame}, FPS={FPS}</div>}

      <label>
        Description:
        <input value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>

      <button type="submit" disabled={!pitcher || !file || frame == null || busy}>
        {busy ? "Saving…" : "Save Pitch"}
      </button>
      {err && <div style={{ color: "crimson" }}>{err}</div>}
    </form>
  );
}
