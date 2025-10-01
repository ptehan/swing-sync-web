// src/components/AddSwingForm.jsx
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
  // Record exact segment by playing video from startFrame → contactFrame
  async function recordByFrames(srcFile, startFrame, endFrame) {
    const startSec = startFrame / FPS;
    const endSec = (endFrame + 1) / FPS;

    const video = document.createElement("video");
    video.src = URL.createObjectURL(srcFile);
    video.muted = true;
    video.playsInline = true;

    // Hide offscreen
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-9999px";
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Failed to load video metadata"));
    });

    const stream = video.captureStream();
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
    const done = new Promise((res) => (recorder.onstop = () => res()));

    // Seek to start
    await new Promise((res, rej) => {
      video.onseeked = () => res();
      video.onerror = () => rej(new Error("Seek failed"));
      video.currentTime = startSec;
    });

    recorder.start();
    video.play();

    // Stop when reaching endSec
    await new Promise((resolve) => {
      const tick = () => {
        if (video.currentTime >= endSec) {
          video.pause();
          recorder.stop();
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });

    await done;
    const blob = new Blob(chunks, { type: "video/webm" });

    wrapper.remove();
    URL.revokeObjectURL(video.src);

    return blob;
  }
  // -------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) return;

    try {
      const clipBlob = await recordByFrames(file, startFrame, contactFrame);

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
