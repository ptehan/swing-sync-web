// src/components/AddSwingForm.jsx
import React, { useState, useRef, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { saveSwingClip } from "../utils/dataModel";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const ffmpeg = new FFmpeg({ log: true });

export default function AddSwingForm({
  hitters,
  onAddSwing,
  constants = { FPS: 30 },
  onClose,
}) {
  const FPS = Number(constants?.FPS) || 30;

  const [selectedHitter, setSelectedHitter] = useState("");
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [description, setDescription] = useState("");
  const [startFrame, setStartFrame] = useState(null);
  const [contactFrame, setContactFrame] = useState(null);
  const [cropBox, setCropBox] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const onChangeFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStartFrame(null);
    setContactFrame(null);
    setCropBox(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
  }, []);

  // -------------------------------------------------------------------
  // Frame-exact: extract → slice → re-encode
  async function cutByFrames(srcFile, startFrame, endFrame) {
    if (!ffmpeg.loaded) {
      await ffmpeg.load({
        coreURL: window.location.origin + "/swing-sync-web/ffmpeg/ffmpeg-core.js",
        wasmURL: window.location.origin + "/swing-sync-web/ffmpeg/ffmpeg-core.wasm",
        workerURL: window.location.origin + "/swing-sync-web/ffmpeg/ffmpeg-core.worker.js",
      });
    }

    await ffmpeg.writeFile("input.webm", new Uint8Array(await srcFile.arrayBuffer()));

    // 1. Extract all frames at fixed FPS
    await ffmpeg.exec([
      "-i", "input.webm",
      "-vf", `fps=${FPS}`,
      "frame_%05d.png",
    ]);

    // 2. Re-encode only the selected range
    const frameCount = endFrame - startFrame + 1;
    await ffmpeg.exec([
      "-framerate", String(FPS),
      "-start_number", String(startFrame + 1), // extracted frames are 1-based
      "-i", "frame_%05d.png",
      "-frames:v", String(frameCount),
      "-c:v", "libvpx-vp9",
      "out.webm",
    ]);

    const data = await ffmpeg.readFile("out.webm");
    const blob = new Blob([data.buffer], { type: "video/webm" });

    // 3. Cleanup (optional but keeps memory low)
    try { await ffmpeg.deleteFile("input.webm"); } catch {}
    try { await ffmpeg.deleteFile("out.webm"); } catch {}
    for (let i = startFrame + 1; i <= endFrame + 1; i++) {
      const fname = `frame_${String(i).padStart(5, "0")}.png`;
      try { await ffmpeg.deleteFile(fname); } catch {}
    }

    return blob;
  }
  // -------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) return;

    try {
      const clipBlob = await cutByFrames(file, startFrame, contactFrame);

      const videoKey = `swing_${selectedHitter}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      await saveSwingClip(videoKey, clipBlob);

      onAddSwing(selectedHitter, {
        startFrame,
        contactFrame,
        videoKey,
        description: description.trim(),
        cropBox,
      });

      alert("Swing saved!");
      if (onClose) onClose();
    } catch (err) {
      console.error("[AddSwingForm] save failed:", err);
      setError(err.message || "Failed to save swing.");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
      <h3>Add Swing</h3>

      <label>
        Hitter:
        <select value={selectedHitter} onChange={(e) => setSelectedHitter(e.target.value)}>
          <option value="">-- Select Hitter --</option>
          {hitters.map((h) => (
            <option key={h.name} value={h.name}>
              {h.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Swing Video:
        <input ref={fileInputRef} type="file" accept="video/*" onChange={onChangeFile} />
      </label>

      {videoUrl && (
        <VideoTagger
          source={videoUrl}
          metadata={{ label: `Swing tagging: ${selectedHitter}` }}
          fps={FPS}
          taggable={true}
          onTagSwing={({ startFrame: s, contactFrame: c }) => {
            if (Number.isFinite(s)) setStartFrame(s);
            if (Number.isFinite(c)) setContactFrame(c);
          }}
        />
      )}

      {(startFrame != null || contactFrame != null) && (
        <div>
          Tagged: start={startFrame ?? "—"}, contact={contactFrame ?? "—"}
          {cropBox && (
            <div>
              Crop: x={Math.round(cropBox.x)}, y={Math.round(cropBox.y)}, w={Math.round(cropBox.w)}, h={Math.round(cropBox.h)}
            </div>
          )}
        </div>
      )}

      <label>
        Description:
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <button
        type="submit"
        disabled={!selectedHitter || !file || startFrame == null || contactFrame == null}
      >
        Save Swing
      </button>

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}
