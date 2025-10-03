// src/components/AddSwingForm.jsx
import React, { useState, useRef, useCallback, useEffect } from "react";
import VideoTagger from "./VideoTagger";
import { saveSwingClip } from "../utils/dataModel";
import * as ffmpegModule from "@ffmpeg/ffmpeg";

const { createFFmpeg, fetchFile } = ffmpegModule;

// Singleton FFmpeg instance
const ffmpeg = createFFmpeg({ log: true });

export default function AddSwingForm({
  hitters,
  onAddSwing,
  constants = { FPS: 30 },
  onClose,
}) {
  const [selectedHitter, setSelectedHitter] = useState("");
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [description, setDescription] = useState("");
  const [startFrame, setStartFrame] = useState(null);
  const [contactFrame, setContactFrame] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [contactTime, setContactTime] = useState(null);
  const [frameOffset, setFrameOffset] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [videoFPS, setVideoFPS] = useState(constants.FPS);

  const fileInputRef = useRef(null);

  // Log component mount with unique version
  useEffect(() => {
    console.log("[AddSwingForm] VERSION_20251002_1 MOUNTED at", new Date().toISOString());
  }, []);

  // Handle file input change
  const onChangeFile = useCallback((e) => {
    console.log("[AddSwingForm] VERSION_20251002_1 File input changed at", new Date().toISOString());
    const f = e.target.files?.[0] || null;
    console.log("[AddSwingForm] VERSION_20251002_1 Selected file:", f ? f.name : "null");
    setFile(f);
    setStartFrame(null);
    setContactFrame(null);
    setStartTime(null);
    setContactTime(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setPreviewUrl(null);
    setVideoFPS(constants.FPS);
    if (f) {
      console.log("[AddSwingForm] VERSION_20251002_1 File selected, skipping metadata for now");
    }
  }, [constants.FPS]);

  // Basic frame-based trimming
  async function trimWithFFmpeg(srcFile, startFrame, endFrame, fps) {
    console.log("[AddSwingForm] VERSION_20251002_1 trimWithFFmpeg called with startFrame=", startFrame, "endFrame=", endFrame, "fps=", fps);
    if (!ffmpeg.isLoaded()) {
      console.log("[AddSwingForm] VERSION_20251002_1 Loading FFmpeg");
      try {
        await ffmpeg.load();
        console.log("[AddSwingForm] VERSION_20251002_1 FFmpeg loaded");
      } catch (err) {
        console.error("[AddSwingForm] VERSION_20251002_1 FFmpeg load failed:", err);
        throw new Error(`FFmpeg load failed: ${err.message}`);
      }
    }
    try {
      const inputFile = "input.mp4";
      ffmpeg.FS("writeFile", inputFile, await fetchFile(srcFile));
      console.log("[AddSwingForm] VERSION_20251002_1 Input file written");

      const adjustedStartFrame = startFrame + frameOffset;
      const adjustedEndFrame = endFrame + frameOffset;
      console.log("[AddSwingForm] VERSION_20251002_1 Trimming frames", adjustedStartFrame, "to", adjustedEndFrame);

      const frameDir = "frames";
      ffmpeg.FS("mkdir", frameDir);
      await ffmpeg.run(
        "-i", inputFile,
        "-vf", `select='between(n,${adjustedStartFrame},${adjustedEndFrame})',setpts=PTS-STARTPTS`,
        "-vsync", "0",
        `${frameDir}/frame_%04d.png`
      );
      console.log("[AddSwingForm] VERSION_20251002_1 Frames extracted");

      const frameFiles = ffmpeg.FS("readdir", frameDir).filter(f => f.endsWith(".png"));
      console.log("[AddSwingForm] VERSION_20251002_1 Extracted", frameFiles.length, "frames (expected:", adjustedEndFrame - adjustedStartFrame + 1, ")");

      if (frameFiles.length === 0) {
        throw new Error("No frames extracted. Check frame range or video integrity.");
      }

      const outputFile = "output.mp4";
      await ffmpeg.run(
        "-framerate", fps.toString(),
        "-i", `${frameDir}/frame_%04d.png`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-an",
        outputFile
      );
      console.log("[AddSwingForm] VERSION_20251002_1 Clip encoded");

      const data = ffmpeg.FS("readFile", outputFile);
      return new Blob([data.buffer], { type: "video/mp4" });
    } finally {
      try {
        ffmpeg.FS("unlink", "input.mp4");
        ffmpeg.FS("unlink", "output.mp4");
        const frameDir = "frames";
        if (ffmpeg.FS("readdir", frameDir)) {
          ffmpeg.FS("readdir", frameDir).forEach(f => {
            if (f.endsWith(".png")) ffmpeg.FS("unlink", `${frameDir}/${f}`);
          });
          ffmpeg.FS("rmdir", frameDir);
        }
      } catch (e) {
        console.warn("[AddSwingForm] VERSION_20251002_1 Cleanup failed:", e);
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("[AddSwingForm] VERSION_20251002_1 Form submitted");
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) {
      console.log("[AddSwingForm] VERSION_20251002_1 Validation failed: missing fields");
      setError("Please select a hitter, video, and set start/contact frames.");
      return;
    }

    if (startFrame >= contactFrame) {
      console.log("[AddSwingForm] VERSION_20251002_1 Validation failed: startFrame >= contactFrame");
      setError("Start frame must be before contact frame.");
      return;
    }

    try {
      setLoading(true);
      console.log("[AddSwingForm] VERSION_20251002_1 Processing: startFrame=", startFrame, `(${startFrame / videoFPS}s), contactFrame=`, contactFrame, `(${contactFrame / videoFPS}s), offset=`, frameOffset);

      const clipBlob = await trimWithFFmpeg(file, startFrame, contactFrame, videoFPS);
      const newPreviewUrl = URL.createObjectURL(clipBlob);
      setPreviewUrl(newPreviewUrl);
      console.log("[AddSwingForm] VERSION_20251002_1 Preview URL generated");

      const videoKey = `swing_${selectedHitter}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await saveSwingClip(videoKey, clipBlob, selectedHitter, description.trim(), startFrame, contactFrame);
      console.log("[AddSwingForm] VERSION_20251002_1 Clip saved");

      onAddSwing(selectedHitter, {
        startFrame,
        contactFrame,
        videoKey,
        description: description.trim(),
        cropBox: null,
      });

      alert("Swing saved!");
      if (onClose) onClose();
    } catch (err) {
      console.error("[AddSwingForm] VERSION_20251002_1 Submit error:", err);
      setError(`Failed to process swing: ${err.message}`);
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
          fps={videoFPS}
          taggable={true}
          onTagSwing={({ startFrame: s, contactFrame: c, startTime: st, contactTime: ct }) => {
            console.log("[AddSwingForm] VERSION_20251002_1 Tagged: startFrame=", s, `(${st?.toFixed(3)}s), contactFrame=`, c, `(${ct?.toFixed(3)}s)`);
            if (Number.isFinite(s)) {
              setStartFrame(s);
              setStartTime(st);
            }
            if (Number.isFinite(c)) {
              setContactFrame(c);
              setContactTime(ct);
            }
          }}
        />
      )}

      {(startFrame != null || contactFrame != null) && (
        <div>
          Tagged: start={startFrame ?? "—"} ({startTime ? startTime.toFixed(3) : "—"}s), 
          contact={contactFrame ?? "—"} ({contactTime ? contactTime.toFixed(3) : "—"}s), 
          FPS={videoFPS}
        </div>
      )}

      <div style={{ display: "grid", gap: "8px" }}>
        <label>
          Manual Start Frame:
          <input
            type="number"
            min="0"
            value={startFrame ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (Number.isFinite(val)) {
                setStartFrame(val);
                setStartTime(val / videoFPS);
                console.log("[AddSwingForm] VERSION_20251002_1 Manual start frame:", val);
              }
            }}
          />
        </label>
        <label>
          Manual Contact Frame:
          <input
            type="number"
            min="0"
            value={contactFrame ?? ""}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (Number.isFinite(val)) {
                setContactFrame(val);
                setContactTime(val / videoFPS);
                console.log("[AddSwingForm] VERSION_20251002_1 Manual contact frame:", val);
              }
            }}
          />
        </label>
        <label>
          Frame Offset (adjust if clip is early/late):
          <input
            type="number"
            value={frameOffset}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 0;
              setFrameOffset(val);
              console.log("[AddSwingForm] VERSION_20251002_1 Frame offset:", val);
            }}
          />
        </label>
      </div>

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
          <h4>Preview of trimmed clip:</h4>
          <video src={previewUrl} controls autoPlay></video>
        </div>
      )}

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}