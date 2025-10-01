// src/components/AddPitchForm.jsx
import React, { useState, useRef, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { savePitchClip, ensureWebmType } from "../utils/dataModel";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const ffmpeg = new FFmpeg({ log: true });

async function toU8(blob) {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

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

  const fileInputRef = useRef(null);

  const onChangeFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setContactFrame(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
  }, []);

  async function extractFramesWithFFmpeg(srcFile, startFrame, endFrame, FPS) {
    if (!ffmpeg.loaded) {
const base = import.meta.env.BASE_URL || "/";

await ffmpeg.load({
  coreURL: base + "ffmpeg/ffmpeg-core.js",
  wasmURL: base + "ffmpeg/ffmpeg-core.wasm",
  workerURL: base + "ffmpeg/ffmpeg-core.worker.js",
});
    }

    await ffmpeg.writeFile("input.webm", await toU8(srcFile));

    // Build filter: select only the frames we want, keep FPS consistent
    const filter = `select='between(n\\,${startFrame}\\,${endFrame})',setpts=N/FRAME_RATE/TB`;

    await ffmpeg.exec([
      "-i", "input.webm",
      "-vf", filter,
      "-r", String(FPS),
      "-an",
      "-c:v", "libvpx",
      "-b:v", "1M",
      "clip.webm",
    ]);

    const out = await ffmpeg.readFile("clip.webm");
    return new Blob([out.buffer], { type: "video/webm" });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedPitcher || !file || contactFrame == null) {
      setError("Please select pitcher, choose video, and tag contact frame.");
      return;
    }

    setBusy(true);
    try {
      const startFrame = Math.max(0, contactFrame - (2 * FPS - 1)); // 60 frames total
      const endFrame = contactFrame;

      const clipBlob = await extractFramesWithFFmpeg(file, startFrame, endFrame, FPS);

      const videoKey = `pitch_${selectedPitcher}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      await savePitchClip(videoKey, clipBlob);

      onAddPitch(selectedPitcher, {
        contactFrame: endFrame - startFrame, // always last frame
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
      try {
        await ffmpeg.deleteFile("input.webm");
        await ffmpeg.deleteFile("clip.webm");
      } catch {}
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
      <h3>Add Pitch</h3>

      <label>
        Pitcher:
        <select value={selectedPitcher} onChange={(e) => setSelectedPitcher(e.target.value)}>
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
        <input ref={fileInputRef} type="file" accept="video/*" onChange={onChangeFile} />
      </label>

      {videoUrl && (
        <VideoTagger
          source={videoUrl}
          metadata={{ label: `Pitch tagging: ${selectedPitcher}` }}
          onTagPitchContact={(f) => {
            if (Number.isFinite(f)) setContactFrame(f);
          }}
          taggable={true}
        />
      )}

      {contactFrame != null && <div>Tagged: contact={contactFrame}</div>}

      <label>
        Description:
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <button type="submit" disabled={!selectedPitcher || !file || contactFrame == null || busy}>
        {busy ? "Saving…" : "Save Pitch"}
      </button>

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}
