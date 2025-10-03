// src/components/AddSwingForm.jsx
import React, { useState, useRef, useEffect } from "react";
import * as ffmpegModule from "@ffmpeg/ffmpeg";

const { createFFmpeg, fetchFile } = ffmpegModule;

const ffmpeg = createFFmpeg({ log: true });

export default function AddSwingForm() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Log on mount
  useEffect(() => {
    console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 MOUNTED at", new Date().toISOString());
  }, []);

  // Handle file input
  const onChangeFile = (e) => {
    console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 File input triggered at", new Date().toISOString());
    const f = e.target.files?.[0] || null;
    console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Selected file:", f ? f.name : "null");
    setFile(f);
    setPreviewUrl(null);
    setError("");
  };

  // Test FFmpeg with hardcoded frames
  const testTrim = async () => {
    if (!file) {
      console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 No file selected for test trim");
      setError("Please select a video file.");
      return;
    }
    console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Starting test trim for frames 100-120, FPS=30");
    try {
      if (!ffmpeg.isLoaded()) {
        console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Loading FFmpeg");
        await ffmpeg.load();
        console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 FFmpeg loaded");
      }
      const inputFile = "input.mp4";
      ffmpeg.FS("writeFile", inputFile, await fetchFile(file));
      console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Input file written");

      const frameDir = "frames";
      ffmpeg.FS("mkdir", frameDir);
      await ffmpeg.run(
        "-i", inputFile,
        "-vf", "select='between(n,100,120)',setpts=PTS-STARTPTS",
        "-vsync", "0",
        `${frameDir}/frame_%04d.png`
      );
      console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Frames extracted");

      const frameFiles = ffmpeg.FS("readdir", frameDir).filter(f => f.endsWith(".png"));
      console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Extracted", frameFiles.length, "frames (expected: 21)");

      if (frameFiles.length === 0) {
        throw new Error("No frames extracted.");
      }

      const outputFile = "output.mp4";
      await ffmpeg.run(
        "-framerate", "30",
        "-i", `${frameDir}/frame_%04d.png`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-an",
        outputFile
      );
      console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Clip encoded");

      const data = ffmpeg.FS("readFile", outputFile);
      const clipBlob = new Blob([data.buffer], { type: "video/mp4" });
      setPreviewUrl(URL.createObjectURL(clipBlob));
      console.log("[AddSwingForm] VERSION_MINIMAL_20251002_2 Test clip created: frames 100-120");
    } catch (err) {
      console.error("[AddSwingForm] VERSION_MINIMAL_20251002_2 Test trim error:", err);
      setError(`Test trim failed: ${err.message}`);
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
        console.warn("[AddSwingForm] VERSION_MINIMAL_20251002_2 Cleanup failed:", e);
      }
    }
  };

  return (
    <div style={{ display: "grid", gap: "12px", padding: "16px" }}>
      <h3>Test Add Swing</h3>
      <label>
        Video File:
        <input ref={fileInputRef} type="file" accept="video/*" onChange={onChangeFile} />
      </label>
      <button onClick={testTrim} disabled={!file}>
        Test Trim (Frames 100-120)
      </button>
      {previewUrl && (
        <div>
          <h4>Test Clip (Frames 100-120):</h4>
          <video src={previewUrl} controls autoPlay style={{ maxWidth: "100%" }} />
        </div>
      )}
      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </div>
  );
}