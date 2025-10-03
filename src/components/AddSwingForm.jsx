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
  const [videoFrameCount, setVideoFrameCount] = useState(null);

  const fileInputRef = useRef(null);

  // Log component mount
  useEffect(() => {
    console.log("[AddSwingForm] Component mounted");
  }, []);

  // Fetch video metadata
  const onChangeFile = useCallback(async (e) => {
    console.log("[AddSwingForm] File input changed");
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStartFrame(null);
    setContactFrame(null);
    setStartTime(null);
    setContactTime(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setPreviewUrl(null);
    setVideoFPS(constants.FPS);
    setVideoFrameCount(null);

    if (f) {
      console.log("[AddSwingForm] Processing video metadata for:", f.name);
      try {
        const { fps, frameCount } = await getVideoMetadata(f);
        setVideoFPS(fps);
        setVideoFrameCount(frameCount);
      } catch (err) {
        console.error("[AddSwingForm] Metadata error:", err);
        setError(`Failed to load video metadata: ${err.message}`);
      }
    }
  }, [constants.FPS]);

  // Get video metadata (FPS and frame count)
  async function getVideoMetadata(srcFile) {
    console.log("[AddSwingForm] Loading FFmpeg for metadata");
    if (!ffmpeg.isLoaded()) {
      try {
        await ffmpeg.load();
        console.log("[AddSwingForm] FFmpeg loaded successfully");
      } catch (err) {
        console.error("[AddSwingForm] FFmpeg load failed:", err);
        throw err;
      }
    }
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(srcFile));
    console.log("[AddSwingForm] Running ffprobe");
    await ffmpeg.run("-i", "input.mp4", "-f", "null", "-");
    const logs = ffmpeg.FS("readFile", "stderr").toString();
    const frameRateMatch = logs.match(/(\d+\.?\d*) fps/);
    const frameCountMatch = logs.match(/frame=\s*(\d+)/);
    const fps = frameRateMatch ? parseFloat(frameRateMatch[1]) : constants.FPS;
    const frameCount = frameCountMatch ? parseInt(frameCountMatch[1], 10) : null;
    console.log(`[AddSwingForm] Video Metadata: FPS=${fps}, Frame Count=${frameCount}`);
    ffmpeg.FS("unlink", "input.mp4");
    return { fps, frameCount };
  }

  // Frame-accurate trimming
  async function trimWithFFmpeg(srcFile, startFrame, endFrame, fps) {
    console.log("[AddSwingForm] Starting FFmpeg trimming");
    if (!ffmpeg.isLoaded()) {
      try {
        await ffmpeg.load();
        console.log("[AddSwingForm] FFmpeg loaded for trimming");
      } catch (err) {
        console.error("[AddSwingForm] FFmpeg load failed:", err);
        throw err;
      }
    }

    try {
      const inputFile = "input.mp4";
      ffmpeg.FS("writeFile", inputFile, await fetchFile(srcFile));
      console.log("[AddSwingForm] Input file written");

      const adjustedStartFrame = startFrame + frameOffset;
      const adjustedEndFrame = endFrame + frameOffset;
      console.log(`[AddSwingForm] Trimming frames ${adjustedStartFrame} to ${adjustedEndFrame}, FPS=${fps}`);

      const frameDir = "frames";
      ffmpeg.FS("mkdir", frameDir);
      await ffmpeg.run(
        "-i", inputFile,
        "-vf", `select='between(n,${adjustedStartFrame},${adjustedEndFrame})',setpts=PTS-STARTPTS`,
        "-vsync", "0",
        `${frameDir}/frame_%04d.png`
      );
      console.log("[AddSwingForm] Frames extracted");

      const frameFiles = ffmpeg.FS("readdir", frameDir).filter(f => f.endsWith(".png"));
      console.log(`[AddSwingForm] Extracted ${frameFiles.length} frames (expected: ${adjustedEndFrame - adjustedStartFrame + 1})`);

      if (frameFiles.length === 0) {
        throw new Error("No frames extracted. Check frame range or video integrity.");
      }

      if (frameFiles.length !== adjustedEndFrame - adjustedStartFrame + 1) {
        console.warn(`[AddSwingForm] Frame count mismatch: got ${frameFiles.length}, expected ${adjustedEndFrame - adjustedStartFrame + 1}`);
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
      console.log("[AddSwingForm] Clip encoded");

      const data = ffmpeg.FS("readFile", outputFile);
      console.log(`[AddSwingForm] Created clip: frames ${adjustedStartFrame} to ${adjustedEndFrame}, FPS: ${fps}, ${frameFiles.length} frames`);
      return new Blob([data.buffer], { type: "video/mp4" });
    } catch (err) {
      console.error("[AddSwingForm] FFmpeg error:", err);
      throw new Error(`FFmpeg processing failed: ${err.message}`);
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
        console.warn("[AddSwingForm] Cleanup failed:", e);
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("[AddSwingForm] Form submitted");
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) {
      console.log("[AddSwingForm] Validation failed: missing required fields");
      setError("Please select a hitter, video, and tag start/contact frames.");
      return;
    }

    if (startFrame >= contactFrame) {
      console.log("[AddSwingForm] Validation failed: startFrame >= contactFrame");
      setError("Start frame must be before contact frame.");
      return;
    }

    if (videoFrameCount && (startFrame + frameOffset >= videoFrameCount || contactFrame + frameOffset >= videoFrameCount)) {
      console.log("[AddSwingForm] Validation failed: frame range exceeds video length");
      setError(`Adjusted frame range (${startFrame + frameOffset}-${contactFrame + frameOffset}) exceeds video length (${videoFrameCount} frames).`);
      return;
    }

    try {
      setLoading(true);
      console.log(`[AddSwingForm] Processing: startFrame=${startFrame} (${(startFrame / videoFPS).toFixed(3)}s), contactFrame=${contactFrame} (${(contactFrame / videoFPS).toFixed(3)}s), offset=${frameOffset}, FPS=${videoFPS}`);

      const clipBlob = await trimWithFFmpeg(file, startFrame, contactFrame, videoFPS);

      const newPreviewUrl = URL.createObjectURL(clipBlob);
      setPreviewUrl(newPreviewUrl);
      console.log("[AddSwingForm] Preview URL generated");

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
      console.log("[AddSwingForm] Clip saved");

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
      console.error("[AddSwingForm] Submit error:", err);
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
            console.log(`[AddSwingForm] Received tag: startFrame=${s}, contactFrame=${c}, startTime=${st?.toFixed(3)}s, contactTime=${ct?.toFixed(3)}s`);
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
          FPS={videoFPS}, Total Frames={videoFrameCount ?? "—"}
        </div>
      )}

      {/* Manual inputs for debugging */}
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
                console.log(`[AddSwingForm] Manual start frame set: ${val}`);
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
                console.log(`[AddSwingForm] Manual contact frame set: ${val}`);
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
              console.log(`[AddSwingForm] Frame offset set: ${val}`);
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