// src/components/MatchupSimulator.jsx
import React, { useMemo, useState, useEffect } from "react";
import {
  getPitchClipBlob,
  getSwingClipBlob,
  getMatchupClipBlob,
  saveMatchupClip,
} from "../utils/dataModel";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const ffmpeg = new FFmpeg({ log: true });

// ✅ basePath works locally and on GitHub Pages
const basePath = (import.meta.env.BASE_URL || "/") + "ffmpeg/";

async function toU8(blob) {
  if (!blob) throw new Error("Null blob passed to toU8");
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function countFrames(filename) {
  let duration = 0;
  let lastLine = "";
  ffmpeg.on("log", ({ message }) => {
    if (message.includes("Duration:")) lastLine = message;
  });
  await ffmpeg.exec(["-i", filename]);
  const match = lastLine.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseFloat(match[3]);
    duration = h * 3600 + m * 60 + s;
  }
  return Math.round(duration * 30);
}

function formatHitterLabel(hitter, swings, swingIndex) {
  if (!hitter) return "";
  const team = hitter.teamName ? ` — ${hitter.teamName}` : "";
  const desc = hitter.description ? ` (${hitter.description})` : "";
  const swing =
    swingIndex != null
      ? swings.filter((s) => s.hitterName === hitter.name)[swingIndex]
      : null;
  let detail = "";
  if (swing && Number.isFinite(swing.startFrame)) {
    detail = `swing start frame ${swing.startFrame}`;
    if (swing.description) detail += ` — ${swing.description}`;
  }
  return `${hitter.name}${team}${desc}${detail ? " — " + detail : ""}`;
}

function formatPitcherLabel(pitcher, pitches, pitchIndex) {
  if (!pitcher) return "";
  const team = pitcher.teamName ? ` — ${pitcher.teamName}` : "";
  const desc = pitcher.description ? ` (${pitcher.description})` : "";
  const pitch = pitchIndex != null ? pitches[pitchIndex] : null;
  let detail = "";
  if (pitch?.description) detail = pitch.description;
  return `${pitcher.name}${team}${desc}${detail ? " — " + detail : ""}`;
}

export default function MatchupSimulator({
  hitters,
  swings,
  pitchers,
  pitches,
  matchups,
  setMatchups,
  requestLoadVideoInTagger,
}) {
  const [selectedHitter, setSelectedHitter] = useState("");
  const [selectedSwingIndex, setSelectedSwingIndex] = useState(null);
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [selectedPitchIndex, setSelectedPitchIndex] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [sideBySideBlob, setSideBySideBlob] = useState(null);
  const [pitcherOnlyBlob, setPitcherOnlyBlob] = useState(null);

  const matchupKey =
    selectedHitter &&
    selectedSwingIndex != null &&
    selectedPitcher &&
    selectedPitchIndex != null
      ? `${selectedHitter}_${selectedSwingIndex}_vs_${selectedPitcher}_${selectedPitchIndex}`
      : null;

  const pitcherPitches = useMemo(
    () => pitches.filter((p) => p.pitcherName === selectedPitcher),
    [pitches, selectedPitcher]
  );

  useEffect(() => {
    if (!matchupKey) {
      setSideBySideBlob(null);
      setPitcherOnlyBlob(null);
      return;
    }
    (async () => {
      const [storedSide, storedPitcher] = await Promise.all([
        getMatchupClipBlob(`${matchupKey}_sideBySide`),
        getMatchupClipBlob(`${matchupKey}_pitcherOnly`),
      ]);
      if (storedSide) setSideBySideBlob(storedSide);
      if (storedPitcher) setPitcherOnlyBlob(storedPitcher);
    })();
  }, [matchupKey]);

  async function generateMatchupClips() {
    setError("");
    setProgress("");

    if (!matchupKey) {
      setError("Select a swing and pitch first.");
      return;
    }

    // ✅ reuse if both blobs exist
    if (sideBySideBlob && pitcherOnlyBlob) {
      setProgress("Reusing cached matchup clips.");
      requestLoadVideoInTagger(sideBySideBlob, "Cached matchup");
      return;
    }

    const swing = swings.filter((s) => s.hitterName === selectedHitter)[selectedSwingIndex];
    const pitch = pitcherPitches[selectedPitchIndex];
    if (!pitch?.videoKey) {
      setError("Missing pitch data.");
      return;
    }
    if (!swing?.videoKey) {
      setError("Missing swing data.");
      return;
    }

    const swingStartFrame = Number.isFinite(swing.startFrame) ? swing.startFrame : null;
    if (swingStartFrame === null || swingStartFrame < 0) {
      setError("Invalid swing start frame: must be a non-negative number.");
      return;
    }

    try {
      if (!ffmpeg.loaded) {
        setProgress("Loading FFmpeg core...");
        await ffmpeg.load({
          coreURL: basePath + "ffmpeg-core.js",
          wasmURL: basePath + "ffmpeg-core.wasm",
          workerURL: basePath + "ffmpeg-core.worker.js",
        });
      }

      ffmpeg.on("log", ({ message }) => {
        setProgress((prev) => prev + "\n" + message);
      });

      const pitchBlob = await getPitchClipBlob(pitch.videoKey);
      await ffmpeg.writeFile("pitch.webm", await toU8(pitchBlob));

      const swingBlob = await getSwingClipBlob(swing.videoKey);
      await ffmpeg.writeFile("swing.webm", await toU8(swingBlob));

      const pitchFrames = await countFrames("pitch.webm");
      const swingFrames = await countFrames("swing.webm");
      if (pitchFrames <= 0 || swingFrames <= 0) {
        setError("Invalid video: zero frames detected.");
        return;
      }

      const fps = 30;
      const swingLength = swingFrames - swingStartFrame;
      const freezeFrames = pitchFrames - swingLength;
      const yellowStart = pitchFrames - swingLength;

      const hitterLabel = formatHitterLabel(
        hitters.find((h) => h.name === selectedHitter),
        swings,
        selectedSwingIndex
      );
      const pitcherLabel = formatPitcherLabel(
        pitchers.find((p) => p.name === selectedPitcher),
        pitcherPitches,
        selectedPitchIndex
      );

      // --- Side-by-side ---
      setProgress("Generating side-by-side...");
      await ffmpeg.exec([
        "-y",
        "-i", "pitch.webm",
        "-i", "swing.webm",
        "-filter_complex",
        `[0:v]fps=${fps},drawbox=0:0:iw:ih:yellow@0.3:t=fill:enable='between(n,${yellowStart},${yellowStart + 2})'[pitcher];` +
        `[1:v]trim=start_frame=${swingStartFrame},setpts=PTS-STARTPTS,fps=${fps}[swingtrim];` +
        `[1:v]trim=start_frame=${swingStartFrame}:end_frame=${swingStartFrame + 1},setpts=PTS-STARTPTS,fps=${fps},loop=${freezeFrames}:1:0[freeze];` +
        `[freeze][swingtrim]concat=n=2:v=1:a=0[hitter];` +
        `[pitcher][hitter]hstack=inputs=2:shortest=0[v]`,
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "out_side.mp4",
      ]);

      const sideData = await ffmpeg.readFile("out_side.mp4");
      const sideBlob = new Blob([sideData.buffer], { type: "video/mp4" });
      setSideBySideBlob(sideBlob);
      await saveMatchupClip(`${matchupKey}_sideBySide`, sideBlob);

      requestLoadVideoInTagger(sideBlob, `${hitterLabel} vs ${pitcherLabel}`);

      // --- Pitcher-only ---
      setProgress("Generating pitcher-only...");
      await ffmpeg.exec([
        "-y",
        "-i", "pitch.webm",
        "-vf",
        `fps=${fps},drawbox=0:0:iw:ih:yellow@0.3:t=fill:enable='between(n,${yellowStart},${yellowStart + 2})'`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "out_pitcher.mp4",
      ]);

      const pitchData = await ffmpeg.readFile("out_pitcher.mp4");
      const pitcherBlob = new Blob([pitchData.buffer], { type: "video/mp4" });
      setPitcherOnlyBlob(pitcherBlob);
      await saveMatchupClip(`${matchupKey}_pitcherOnly`, pitcherBlob);

      setProgress("Done!");
    } catch (err) {
      console.error("FFmpeg error:", err);
      setError(`Failed to generate matchup: ${err.message || "Unknown FFmpeg error"}`);
    } finally {
      setBusy(false);
      try {
        await ffmpeg.deleteFile("pitch.webm");
        await ffmpeg.deleteFile("swing.webm");
        await ffmpeg.deleteFile("out_side.mp4");
        await ffmpeg.deleteFile("out_pitcher.mp4");
      } catch {}
    }
  }

  async function exportPitcherFrame() {
    if (!matchupKey) {
      setError("No matchup selected.");
      return;
    }
    try {
      if (!ffmpeg.loaded) {
        setProgress("Loading FFmpeg core...");
        await ffmpeg.load({
          coreURL: basePath + "ffmpeg-core.js",
          wasmURL: basePath + "ffmpeg-core.wasm",
          workerURL: basePath + "ffmpeg-core.worker.js",
        });
      }

      const pitch = pitcherPitches[selectedPitchIndex];
      if (!pitch?.videoKey) return setError("Missing pitch data.");

      const pitchBlob = await getPitchClipBlob(pitch.videoKey);
      await ffmpeg.writeFile("pitch.webm", await toU8(pitchBlob));

      // count pitch frames
      const pitchFrames = await countFrames("pitch.webm");

      // find swing to know yellowStart
      const swing = swings.filter((s) => s.hitterName === selectedHitter)[selectedSwingIndex];
      const swingStartFrame = swing.startFrame ?? 0;
      const swingLength = 30; // fallback ~1s swing
      const yellowStart = pitchFrames - swingLength;

      // grab the pitcher frame at yellowStart
      await ffmpeg.exec([
        "-y",
        "-i", "pitch.webm",
        "-vf", `select='eq(n,${yellowStart})'`,
        "-vframes", "1",
        "frame.png",
      ]);

      const pngData = await ffmpeg.readFile("frame.png");
      const pngBlob = new Blob([pngData.buffer], { type: "image/png" });
      downloadBlob(pngBlob, `${matchupKey}_pitcherFrame.png`);

      try {
        await ffmpeg.deleteFile("pitch.webm");
        await ffmpeg.deleteFile("frame.png");
      } catch {}
    } catch (err) {
      console.error(err);
      setError("Failed to export pitcher frame.");
    }
  }

  return (
    <div>
      <h2>Matchup Simulator</h2>

      {/* dropdowns unchanged */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <select
          value={selectedHitter}
          onChange={(e) => setSelectedHitter(e.target.value)}
        >
          <option value="">-- select hitter --</option>
          {hitters.map((h) => (
            <option key={h.name} value={h.name}>
              {h.name}
              {h.teamName ? ` — ${h.teamName}` : ""}
              {h.description ? ` (${h.description})` : ""}
            </option>
          ))}
        </select>

        <select
          disabled={!selectedHitter}
          value={selectedSwingIndex ?? ""}
          onChange={(e) => setSelectedSwingIndex(Number(e.target.value))}
        >
          <option value="">-- select swing --</option>
          {swings
            .filter((s) => s.hitterName === selectedHitter)
            .map((s, i) => (
              <option key={i} value={i}>
                Swing {i + 1}
                {Number.isFinite(s.startFrame) ? ` (start frame ${s.startFrame})` : ""}
                {s.description ? ` — ${s.description}` : ""}
              </option>
            ))}
        </select>

        <select
          value={selectedPitcher}
          onChange={(e) => setSelectedPitcher(e.target.value)}
        >
          <option value="">-- select pitcher --</option>
          {pitchers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.teamName ? ` — ${p.teamName}` : ""}
              {p.description ? ` (${p.description})` : ""}
            </option>
          ))}
        </select>

        <select
          disabled={!selectedPitcher}
          value={selectedPitchIndex ?? ""}
          onChange={(e) => setSelectedPitchIndex(Number(e.target.value))}
        >
          <option value="">-- select pitch --</option>
          {pitcherPitches.map((pitch, i) => (
            <option key={i} value={i}>
              Pitch {i + 1}
              {pitch.description ? ` — ${pitch.description}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* buttons */}
      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={generateMatchupClips} disabled={busy}>
          Generate Matchup
        </button>
        <button
          onClick={() =>
            sideBySideBlob &&
            downloadBlob(
              sideBySideBlob,
              `${selectedHitter}_vs_${selectedPitcher}_sidebyside.mp4`
            )
          }
          disabled={!sideBySideBlob}
        >
          Export Side-by-Side
        </button>
        <button
          onClick={() =>
            pitcherOnlyBlob &&
            downloadBlob(
              pitcherOnlyBlob,
              `${selectedHitter}_vs_${selectedPitcher}_pitcheronly.mp4`
            )
          }
          disabled={!pitcherOnlyBlob}
        >
          Export Pitcher-Only
        </button>
        <button onClick={exportPitcherFrame} disabled={!pitcherOnlyBlob}>
          Export Pitcher Frame
        </button>
      </div>

      {progress && (
        <pre style={{ color: "blue", whiteSpace: "pre-wrap" }}>{progress}</pre>
      )}
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}
