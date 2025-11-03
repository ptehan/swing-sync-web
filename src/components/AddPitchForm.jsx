// src/components/AddPitchForm.jsx
import React, { useState, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { savePitchClip } from "../utils/dataModel";

/* ---------- FRAME CAPTURE (MP4 OUTPUT, EXACT 60 FRAMES) ---------- */
async function captureFrames(file, contactFrame, FPS) {
  console.log("[captureFrames] MP4 deterministic capture start");

  const totalFrames = FPS * 2; // 60 frames @ 30fps
  const endFrame = contactFrame;
  const startFrame = Math.max(0, endFrame - totalFrames + 1);
  const startTimeSec = startFrame / FPS;
  const frameStep = 1 / FPS;

  console.log(
    `[captureFrames] start=${startFrame}, end=${endFrame}, total=${totalFrames} frames (${(
      totalFrames / FPS
    ).toFixed(2)}s)`
  );

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    video.onloadedmetadata = async () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      const mp4Mime = "video/mp4;codecs=avc1.42E01E";
      const fallbackMime = "video/webm;codecs=vp9";
      const mimeType = MediaRecorder.isTypeSupported(mp4Mime)
        ? mp4Mime
        : fallbackMime;

      const chunks = [];
      const rec = new MediaRecorder(canvas.captureStream(FPS), {
        mimeType,
        videoBitsPerSecond: 10_000_000,
      });

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log(`[captureFrames] ✅ recorded ${blob.size} bytes as ${mimeType}`);
        if (blob.size < 512) reject(new Error("Empty output"));
        else resolve({ blob });
      };

      rec.start();
      console.log(`[captureFrames] recording exactly ${totalFrames} frames…`);

      let frameIndex = 0;
      const drawNext = () => {
        if (frameIndex >= totalFrames) {
          // allow the last frame to fully render
          setTimeout(() => rec.stop(), 500);
          return;
        }

        const t = startTimeSec + frameIndex * frameStep;
        video.currentTime = t;
        video.onseeked = () => {
          if (video.readyState < 4) {
            requestAnimationFrame(drawNext);
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
          frameIndex++;
          setTimeout(() => requestAnimationFrame(drawNext), 1000 / FPS);
        };
      };

      drawNext();
    };

    video.onerror = () => reject(new Error("Video load failed"));
  });
}

/* ---------- COMPONENT ---------- */
export default function AddPitchForm({
  pitchers,
  onAddPitch,
  constants = { FPS: 30 },
  onClose,
}) {
  const FPS = Number(constants?.FPS) || 30;
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [description, setDescription] = useState("");
  const [contactFrame, setContactFrame] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onChangeFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setContactFrame(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setError("");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedPitcher || !file || contactFrame == null) {
      setError("Please select pitcher, choose video, and tag contact frame.");
      return;
    }

    try {
      setBusy(true);
      console.log("[AddPitchForm] capture start");
      const { blob } = await captureFrames(file, contactFrame, FPS);
      console.log("[AddPitchForm] final blob size", blob.size);

      const videoKey = `pitch_${selectedPitcher}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      await savePitchClip(videoKey, blob, description.trim(), contactFrame);

      onAddPitch(selectedPitcher, {
        contactFrame,
        videoKey,
        description: description.trim(),
      });

      alert("Pitch saved!");
      if (onClose) onClose();
    } catch (err) {
      console.error("[AddPitchForm] save failed:", err);
      setError(err.message || "Failed to save pitch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
      <h3>Add Pitch</h3>

      <label>
        Pitcher:
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

      <label>
        Pitch Video:
        <input type="file" accept="video/*" onChange={onChangeFile} />
      </label>

      {videoUrl && (
        <div>
          <VideoTagger
            source={videoUrl}
            metadata={{ label: `Pitch tagging: ${selectedPitcher}` }}
            fps={FPS}
            taggable
            onTagPitchContact={(f) => setContactFrame(f)}
          />
        </div>
      )}

      {contactFrame != null && <div>Tagged contact={contactFrame}, FPS={FPS}</div>}

      <label>
        Description:
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={!selectedPitcher || !file || contactFrame == null || busy}
      >
        {busy ? "Saving…" : "Save Pitch"}
      </button>

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}
