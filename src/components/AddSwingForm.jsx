// src/components/AddSwingForm.jsx
import React, { useState, useRef, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { saveSwingClip, ensureWebmType } from "../utils/dataModel";

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
  // Smooth recorder using video.captureStream
  async function recordSegmentViaVideoStream(srcFile, startSec, endSec) {
    const mime = "video/webm;codecs=vp9";
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const wrapper = document.createElement("div");
    Object.assign(wrapper.style, { position: "fixed", left: "-9999px" });
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    const url = URL.createObjectURL(srcFile);
    video.src = url;
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Failed to load metadata"));
    });

    const stream = video.captureStream();
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data && chunks.push(e.data);
    const done = new Promise((res) => (recorder.onstop = () => res()));

    await new Promise((res, rej) => {
      video.onseeked = () => res();
      video.onerror = () => rej(new Error("Seek failed"));
      video.currentTime = startSec;
    });

    recorder.start();
    video.play();

    await new Promise((resolve) => {
      let raf = 0;
      const tick = () => {
        if (video.currentTime >= endSec) {
          video.pause();
          recorder.stop();
          cancelAnimationFrame(raf);
          resolve();
        } else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    await done;
    const blob = new Blob(chunks, { type: mime });
    URL.revokeObjectURL(url);
    wrapper.remove();
    return ensureWebmType(blob);
  }
  // -------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) return;

    try {
      const startClipFrame = Math.max(0, contactFrame - 2 * FPS);
      const startSec = startClipFrame / FPS;
      const endSec = (contactFrame + 3) / FPS;

      const clipBlob = await recordSegmentViaVideoStream(file, startSec, endSec);

      const framesInClip = Math.round((endSec - startSec) * FPS);
      const adjustedStartFrame = startFrame - startClipFrame;
      const adjustedContactFrame = framesInClip - 1;
      const swingFrames = adjustedContactFrame - adjustedStartFrame;
      const swingTime = swingFrames > 0 ? swingFrames / FPS : null;

      const videoKey = `swing_${selectedHitter}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      await saveSwingClip(videoKey, clipBlob);

      onAddSwing(selectedHitter, {
        startFrame: adjustedStartFrame,
        contactFrame: adjustedContactFrame,
        swingTime,
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
          taggable={true} // ✅ show HUD controls with Set Start / Set Contact
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