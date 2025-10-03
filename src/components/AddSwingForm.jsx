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
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [videoFPS, setVideoFPS] = useState(constants.FPS);
  const [videoFrameCount, setVideoFrameCount] = useState(null);

  const fileInputRef = useRef(null);

  // Fetch video metadata when file changes
  const onChangeFile = useCallback(async (e) => {
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
      try {
        const { fps, frameCount } = await getVideoMetadata(f);
        setVideoFPS(fps);
        setVideoFrameCount(frameCount);
      } catch (err) {
        setError(`Failed to load video metadata: ${err.message}`);
      }
    }
  }, [constants.FPS]);

  // Get video metadata (FPS and frame count)
  async function getVideoMetadata(srcFile) {
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(srcFile));
    await ffmpeg.run("-i", "input.mp4", "-f", "null", "-");
    const logs = ffmpeg.FS("readFile", "stderr").toString();
    const frameRateMatch = logs.match(/(\d+\.?\d*) fps/);
    const frameCountMatch = logs.match(/frame=\s*(\d+)/);
    const fps = frameRateMatch ? parseFloat(frameRateMatch[1]) : constants.FPS;
    const frameCount = frameCountMatch ? parseInt(frameCountMatch[1], 10) : null;
    console.log(`Video Metadata: FPS=${fps}, Frame Count=${frameCount}`);
    return { fps, frameCount };
  }

  // Frame-accurate trimming by extracting individual frames
  async function trimWithFFmpeg(srcFile, startFrame, endFrame, fps) {
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    try {
      const inputFile = "input.mp4";
      ffmpeg.FS("writeFile", inputFile, await fetchFile(srcFile));

      // Extract exact frames as images
      const frameDir = "frames";
      ffmpeg.FS("mkdir", frameDir);
      await ffmpeg.run(
        "-i", inputFile,
        "-vf", `select='between(n,${startFrame},${endFrame})',setpts=PTS-STARTPTS`,
        "-vsync", "0",
        `${frameDir}/frame_%04d.png`
      );

      // Verify extracted frames
      const frameFiles = ffmpeg.FS("readdir", frameDir).filter(f => f.endsWith(".png"));
      console.log(`Extracted ${frameFiles.length} frames (expected: ${endFrame - startFrame + 1})`);

      if (frameFiles.length === 0) {
        throw new Error("No frames extracted. Check frame range or video integrity.");
      }

      if (frameFiles.length !== endFrame - startFrame + 1) {
        console.warn(`Frame count mismatch: got ${frameFiles.length}, expected ${endFrame - startFrame + 1}`);
      }

      // Re-encode frames into video
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

      const data = ffmpeg.FS("readFile", outputFile);
      console.log(`Created clip: frames ${startFrame} to ${endFrame}, FPS: ${fps}, ${frameFiles.length} frames`);
      return new Blob([data.buffer], { type: "video/mp4" });
    } catch (err) {
      throw new Error(`FFmpeg processing failed: ${err.message}`);
    } finally {
      try {
        ffmpeg.FS("unlink", inputFile);
        ffmpeg.FS("unlink", outputFile);
        const frameDir = "frames";
        if (ffmpeg.FS("readdir", frameDir)) {
          ffmpeg.FS("readdir", frameDir).forEach(f => {
            if (f.endsWith(".png")) ffmpeg.FS("unlink", `${frameDir}/${f}`);
          });
          ffmpeg.FS("rmdir", frameDir);
        }
      } catch (e) {
        console.warn("Failed to clean up FFmpeg FS:", e);
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) {
      setError("Please select a hitter, video, and tag start/contact frames.");
      return;
    }

    if (startFrame >= contactFrame) {
      setError("Start frame must be before contact frame.");
      return;
    }

    if (videoFrameCount && (startFrame >= videoFrameCount || contactFrame >= videoFrameCount)) {
      setError(`Frame range (${startFrame}-${contactFrame}) exceeds video length (${videoFrameCount} frames).`);
      return;
    }

    try {
      setLoading(true);
      console.log(`Processing: startFrame=${startFrame} (${(startFrame / videoFPS).toFixed(3)}s), contactFrame=${contactFrame} (${(contactFrame / videoFPS).toFixed(3)}s), FPS=${videoFPS}`);

      const clipBlob = await trimWithFFmpeg(file, startFrame, contactFrame, videoFPS);

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
        cropBox: null,
      });

      alert("Swing saved!");
      if (onClose) onClose();
    } catch (err) {
      console.error("[AddSwingForm] Error:", err);
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
            if (Number.isFinite(s)) {
              setStartFrame(s);
              setStartTime(st);
            }
            if (Number.isFinite(c)) {
              setContactFrame(c);
              setContactTime(ct);
            }
            console.log(`Tagged: startFrame=${s} (${st?.toFixed(3)}s), contactFrame=${c} (${ct?.toFixed(3)}s), FPS=${videoFPS}`);
          }}
        />
      )}

      {(startFrame != null || contactFrame != null) && (
        <div>
          Tagged: start={startFrame ?? "—"} ({startTime ? startTime.toFixed(3) : "—"}s), contact={contactFrame ?? "—"} ({contactTime ? contactTime.toFixed(3) : "—"}s), FPS={videoFPS}, Total Frames={videoFrameCount ?? "—"}
        </div>
      )}

      {/* Manual frame input as fallback */}
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
              }
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