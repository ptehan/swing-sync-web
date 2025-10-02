// src/components/AddSwingForm.jsx
import React, { useState, useRef, useCallback } from "react";
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
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [videoFPS, setVideoFPS] = useState(constants.FPS);

  const fileInputRef = useRef(null);

  const onChangeFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStartFrame(null);
    setContactFrame(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setPreviewUrl(null);
    setVideoFPS(constants.FPS); // Reset to default, will update after ffprobe
  }, [constants.FPS]);

  // Get video frame rate using ffprobe
  async function getVideoFrameRate(srcFile) {
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }
    ffmpeg.FS("writeFile", "input.mp4", await fetchFile(srcFile));
    await ffmpeg.run("-i", "input.mp4", "-f", "null", "-");
    const logs = ffmpeg.FS("readFile", "stderr").toString();
    const frameRateMatch = logs.match(/(\d+\.?\d*) fps/);
    const fps = frameRateMatch ? parseFloat(frameRateMatch[1]) : constants.FPS;
    console.log(`Detected FPS: ${fps}`);
    return fps;
  }

  // Frame-accurate trimming with FFmpeg
  async function trimWithFFmpeg(srcFile, startFrame, endFrame, fps) {
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    try {
      // Write input file
      const inputFile = "input.mp4";
      const intermediateFile = "intermediate.mp4";
      const outputFile = "output.mp4";
      ffmpeg.FS("writeFile", inputFile, await fetchFile(srcFile));

      // Step 1: Re-encode to constant frame rate to ensure frame accuracy
      await ffmpeg.run(
        "-i", inputFile,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "18",
        "-r", fps.toString(), // Force constant frame rate
        "-an", // No audio
        intermediateFile
      );

      // Step 2: Trim exact frames using select filter
      await ffmpeg.run(
        "-i", intermediateFile,
        "-vf", `select='between(n,${startFrame},${endFrame})',setpts=PTS-STARTPTS`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "18",
        "-r", fps.toString(),
        "-an",
        outputFile
      );

      const data = ffmpeg.FS("readFile", outputFile);
      console.log(`Trimmed clip: frames ${startFrame} to ${endFrame}, FPS: ${fps}`);
      return new Blob([data.buffer], { type: "video/mp4" });
    } catch (err) {
      throw new Error(`FFmpeg trimming failed: ${err.message}`);
    } finally {
      // Clean up
      try {
        ffmpeg.FS("unlink", "input.mp4");
        ffmpeg.FS("unlink", "intermediate.mp4");
        ffmpeg.FS("unlink", "output.mp4");
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

    try {
      setLoading(true);
      const fps = await getVideoFrameRate(file);
      setVideoFPS(fps); // Update for VideoTagger consistency
      console.log(`Processing: frames ${startFrame} to ${contactFrame}, FPS: ${fps}`);

      const clipBlob = await trimWithFFmpeg(file, startFrame, contactFrame, fps);

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
          fps={videoFPS} // Use detected FPS
          taggable={true}
          onTagSwing={({ startFrame: s, contactFrame: c }) => {
            if (Number.isFinite(s)) setStartFrame(s);
            if (Number.isFinite(c)) setContactFrame(c);
            console.log(`Tagged frames: start=${s}, contact=${c}`);
          }}
        />
      )}

      {(startFrame != null || contactFrame != null) && (
        <div>
          Tagged: start={startFrame ?? "—"}, contact={contactFrame ?? "—"}, FPS={videoFPS}
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
          <h4>Preview of trimmed clip:</h4>
          <video src={previewUrl} controls autoPlay></video>
        </div>
      )}

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}