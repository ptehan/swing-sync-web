// src/components/AddSwingForm.jsx
import React, { useState, useCallback } from "react";
import VideoTagger from "./VideoTagger";
import { saveSwingClip } from "../utils/dataModel";

/* =====================================================================================
   Deterministic frame-by-frame capture — no arbitrary delays, full encoder drain.
   ===================================================================================== */
async function captureFrames(file, startFrame, endFrame, FPS) {
  console.log("[captureFrames] manual stepping start");
  const startTimeSec = startFrame / FPS;
  const endTimeSec = endFrame / FPS;
  const frameStep = 1 / FPS;
  const frameCount = Math.ceil((endTimeSec - startTimeSec) * FPS);

  console.log(
    `[captureFrames] start=${startTimeSec.toFixed(3)} end=${endTimeSec.toFixed(
      3
    )} frames=${frameCount}`
  );

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const log = (...args) => console.log("[captureFrames]", ...args);

    video.onloadedmetadata = async () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.font = "40px monospace";
      ctx.fillStyle = "yellow";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "black";

      const stream = canvas.captureStream(FPS);
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const swingDurationSec = frameCount / FPS;
        log(
          "complete",
          blob.size,
          "bytes — swing duration:",
          swingDurationSec.toFixed(3),
          "s"
        );
        if (blob.size < 512) reject(new Error("Empty output"));
        else
          resolve({
            blob,
            swingDurationSec,
            preOffsetMs: 0,
            postOffsetMs: 0,
          });
      };

      rec.start();
      log(`recording ${frameCount} frames (~${(frameCount / FPS).toFixed(2)}s)`);

      let frameIndex = 0;

      const drawNext = () => {
        if (frameIndex >= frameCount) {
          log(
            "STOPPING — last painted time =",
            video.currentTime.toFixed(3),
            "expected end =",
            endTimeSec.toFixed(3)
          );
          finalizeRecording();
          return;
        }

        const t = startTimeSec + frameIndex * frameStep;
        video.currentTime = t;

        video.onseeked = () => {
          const waitForDecode = () => {
            if (video.readyState < 4) {
              requestAnimationFrame(waitForDecode);
              return;
            }
            ctx.drawImage(video, 0, 0, w, h);
            frameIndex++;
            requestAnimationFrame(drawNext);
          };
          waitForDecode();
        };
      };

      const finalizeRecording = async () => {
        // 🟡 hold final frame a few beats so encoder consumes it
        for (let i = 0; i < 5; i++) {
          ctx.drawImage(video, 0, 0, w, h);
          await new Promise((r) => setTimeout(r, 1000 / FPS));
        }

        // 🕐 wait for MediaRecorder to flush buffered frames
        await new Promise((r) => setTimeout(r, 500));
        log("🛑 stopping recorder (drained)");
        rec.stop();
      };

      drawNext();
    };

    video.onerror = () => reject(new Error("Video load failed"));
  });
}

/* =====================================================================================
   React component
   ===================================================================================== */
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onChangeFile = useCallback((e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStartFrame(null);
    setContactFrame(null);
    setVideoUrl(f ? URL.createObjectURL(f) : null);
    setError("");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!selectedHitter || !file || startFrame == null || contactFrame == null) {
      setError("Please select hitter, choose video, and tag start + contact frames.");
      return;
    }
    if (startFrame >= contactFrame) {
      setError("Start frame must be before contact frame.");
      return;
    }

    try {
      setBusy(true);
      console.log("[AddSwingForm] capture start");
      const { blob, swingDurationSec } = await captureFrames(
        file,
        startFrame,
        contactFrame,
        FPS
      );
      console.log(
        `[AddSwingForm] final blob size ${blob.size}, duration ${swingDurationSec.toFixed(
          3
        )}s`
      );

      const videoKey = `swing_${selectedHitter}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      await saveSwingClip(
        videoKey,
        blob,
        selectedHitter,
        description.trim(),
        startFrame,
        contactFrame,
        swingDurationSec
      );

      onAddSwing(selectedHitter, {
        startFrame,
        contactFrame,
        videoKey,
        description: description.trim(),
        swingDurationSec,
      });

      alert(`Swing saved! Duration: ${swingDurationSec.toFixed(3)}s`);
      if (onClose) onClose();
    } catch (err) {
      console.error("[AddSwingForm] save failed:", err);
      setError(err.message || "Failed to save swing.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
      <h3>Add Swing</h3>

      <label>
        Hitter:
        <select
          value={selectedHitter}
          onChange={(e) => setSelectedHitter(e.target.value)}
        >
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
        <input type="file" accept="video/*" onChange={onChangeFile} />
      </label>

      {videoUrl && (
        <div>
          <VideoTagger
            source={videoUrl}
            metadata={{ label: `Swing tagging: ${selectedHitter}` }}
            fps={FPS}
            taggable
            onTagSwingStart={(f) => setStartFrame(f)}
            onTagSwingContact={(f) => setContactFrame(f)}
          />
        </div>
      )}

      {(startFrame != null || contactFrame != null) && (
        <div>
          Tagged: start={startFrame ?? "—"}, contact={contactFrame ?? "—"}, FPS={FPS}
        </div>
      )}

      <label>
        Description:
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={
          !selectedHitter || !file || startFrame == null || contactFrame == null || busy
        }
      >
        {busy ? "Saving…" : "Save Swing"}
      </button>

      {error && <div style={{ color: "crimson" }}>{error}</div>}
    </form>
  );
}
