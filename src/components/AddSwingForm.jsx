// src/components/AddSwingForm.jsx
import React, { useState, useRef, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { saveSwingClip } from "../utils/dataModel";

// lazy ffmpeg instance
let ffmpegInstance = null;

async function getFFmpeg() {
  if (!ffmpegInstance) {
    const { createFFmpeg, fetchFile } = await import("@ffmpeg/ffmpeg");
    ffmpegInstance = createFFmpeg({ log: true });
    ffmpegInstance.fetchFile = fetchFile;
  }
  return ffmpegInstance;
}

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
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef(null);

  const onChangeFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStartFrame(null);
    setContactFrame(null);
    setCropBox(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setPreviewUrl(null);
  }, []);

  // -------------------------------------------------------------------
  // ffmpeg precise cutting
  async function cutClipFFmpeg(srcFile, startFrame, endFrame) {
    const ffmpeg = await getFFmpeg();
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    const startSec = startFrame / FPS;
    const endSec = (endFrame + 1) / FPS; // include contact frame

    // load file into ffmpeg FS
    ffmpeg.FS("writeFile", "input.mp4", await ffmpeg.fetchFile(srcFile));

    // run cut
    await ffmpeg.run(
      "-i", "input.mp4",
      "-ss", startSec.toString(),
      "-to", endSec.toString(),
      "-c:v", "libvpx-vp9", // re-encode for frame accuracy
      "-an",                 // drop audio
      "output.webm"
    );

    const data = ffmpeg.FS("readFile", "output.webm");
    return new Blob([data.buffer], { type: "video/webm" });
  }
  // -------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) return;

    try {
      setLoading(true);
      console.log("Cutting new clip:", startFrame, "→", contactFrame);

      const clipBlob = await cutClipFFmpeg(file, startFrame, contactFrame);

      const adjustedStartFrame = 0; // clip starts at tagged start
      const adjustedContactFrame = contactFrame - startFrame;
      const swingFrames = contactFrame - startFrame;
      const swingTime = swingFrames > 0 ? swingFrames / FPS : null;

      const videoKey = `swing_${selectedHitter}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      await saveSwingClip(
        videoKey,
        clipBlob,
        selectedHitter,
        description.trim(),
        adjustedStartFrame,
        adjustedContactFrame
      );

      onAddSwing(selectedHitter, {
        startFrame: adjustedStartFrame,
        contactFrame: adjustedContactFrame,
        swingTime,
        videoKey,
        description: description.trim(),
        cropBox,
      });

      const newPreviewUrl = URL.createObjectURL(clipBlob);
      setPreviewUrl(newPreviewUrl);

      alert("Swing saved!");
      if (onClose) onClose();
    } catch (err) {
      console.error("[AddSwingForm] ffmpeg cut failed:", err);
      setError(err.message || "Failed to cut swing with ffmpeg.");
    } finally {
      setLoading(false);
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
        </div>
      )}

      <label>
        Description:
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <button
        type="submit"
        disabled={!selectedHitter || !file || startFrame == null || contactFrame == null || loading}
      >
        {loading ? "Saving..." : "Save Swing"}
      </button>

      {previewUrl && (
        <div>
          <h4>Preview of saved clip:</h4>
          <video src={previewUrl} controls autoPlay></video>
        </div>
      )}

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}
