import React, { useState, useRef, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { saveSwingClip } from "../utils/dataModel";

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

  // --- Canvas frame-by-frame re-encode ---
  async function cutClipCanvas(srcFile, startFrame, endFrame, fps) {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(srcFile);
    video.muted = true;
    video.playsInline = true;

    // wait for metadata
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = (e) => rej(e);
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // capture stream from canvas
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
    const done = new Promise((res) => (recorder.onstop = () => res()));
    recorder.start();

    // step through frames
    for (let f = startFrame; f <= endFrame; f++) {
      const t = f / fps;
      await new Promise((resolve, reject) => {
        video.currentTime = t;
        video.onseeked = () => {
          ctx.drawImage(video, 0, 0, width, height);
          resolve();
        };
        video.onerror = reject;
      });
      // wait one frame interval so MediaRecorder captures it
      await new Promise((r) => setTimeout(r, 1000 / fps));
    }

    recorder.stop();
    await done;

    URL.revokeObjectURL(video.src);
    return new Blob(chunks, { type: "video/webm" });
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) return;

    try {
      setLoading(true);
      console.log("Canvas re-encode:", startFrame, "→", contactFrame);

      const clipBlob = await cutClipCanvas(file, startFrame, contactFrame, FPS);

      const newPreviewUrl = URL.createObjectURL(clipBlob);
      setPreviewUrl(newPreviewUrl);

      const videoKey = `swing_${selectedHitter}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      await saveSwingClip(
        videoKey,
        clipBlob,
        selectedHitter,
        description.trim(),
        startFrame,
        contactFrame
      );

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
      console.error("[AddSwingForm] canvas cut failed:", err);
      setError(err.message || "Failed to save swing.");
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
        {loading ? "Processing..." : "Save Swing"}
      </button>

      {previewUrl && (
        <div>
          <h4>Preview of recorded clip:</h4>
          <video src={previewUrl} controls></video>
        </div>
      )}

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}
