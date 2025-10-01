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
  // Cut clip between exact frame indices (inclusive)
  async function cutByFrames(srcFile, startFrame, endFrame) {
    if (!ffmpeg.loaded) {
      await ffmpeg.load({
        coreURL: window.location.origin + "/swing-sync-web/ffmpeg/ffmpeg-core.js",
        wasmURL: window.location.origin + "/swing-sync-web/ffmpeg/ffmpeg-core.wasm",
        workerURL: window.location.origin + "/swing-sync-web/ffmpeg/ffmpeg-core.worker.js",
      });
    }

    await ffmpeg.writeFile("input.webm", new Uint8Array(await srcFile.arrayBuffer()));

    await ffmpeg.exec([
      "-i", "input.webm",
      "-vf", `select='between(n\\,${startFrame}\\,${endFrame})',setpts=N/FRAME_RATE/TB`,
      "-an",
      "out.webm",
    ]);

    const data = await ffmpeg.readFile("out.webm");
    const blob = new Blob([data.buffer], { type: "video/webm" });

    await ffmpeg.deleteFile("input.webm");
    await ffmpeg.deleteFile("out.webm");

    return blob;
  }
  // -------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) return;

    try {
      // cut exactly between the tagged frames
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
