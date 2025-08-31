import React, { useMemo, useState } from "react";
import { getPitchClipBlob, getSwingClipBlob } from "../utils/dataModel";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const ffmpeg = new FFmpeg({ log: true });

async function toU8(blob) {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

export default function MatchupSimulator({
  hitters,
  swings,
  pitchers,
  pitches,
  requestLoadVideoInTagger,
}) {
  const [selectedHitter, setSelectedHitter] = useState("");
  const [selectedSwingIndex, setSelectedSwingIndex] = useState(null);
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [selectedPitchIndex, setSelectedPitchIndex] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const pitcherPitches = useMemo(
    () => pitches.filter((p) => p.pitcherName === selectedPitcher),
    [pitches, selectedPitcher]
  );

  async function generateClip() {
    setError("");
    setProgress("");

    if (
      !selectedHitter ||
      selectedSwingIndex == null ||
      !selectedPitcher ||
      selectedPitchIndex == null
    ) {
      setError("Select a swing and pitch first.");
      return;
    }

    const swing = swings.filter((s) => s.hitterName === selectedHitter)[
      selectedSwingIndex
    ];
    const pitch = pitcherPitches[selectedPitchIndex];
    if (!swing || !pitch?.videoKey) {
      setError("Missing swing or pitch data.");
      return;
    }

    setBusy(true);

    try {
      if (!ffmpeg.loaded) {
        setProgress("Loading FFmpeg core...");
        await ffmpeg.load({
          coreURL: window.location.origin + "/ffmpeg/ffmpeg-core.js",
          wasmURL: window.location.origin + "/ffmpeg/ffmpeg-core.wasm",
          workerURL: window.location.origin + "/ffmpeg/ffmpeg-core.worker.js",
        });
        console.log("FFmpeg loaded");
      }

      const pitchBlob = await getPitchClipBlob(pitch.videoKey);
      const swingBlob = await getSwingClipBlob(swing.videoKey);

      console.log("Pitch blob size:", pitchBlob.size);
      console.log("Swing blob size:", swingBlob.size);

      await ffmpeg.writeFile("pitch.webm", await toU8(pitchBlob));
      await ffmpeg.writeFile("swing.webm", await toU8(swingBlob));

      const fps = 30;
      const swingStart = swing.startFrame || 1; // ensure ≥1
      const swingStartSec = swingStart / fps;
      const highlightDur = 3 / fps; // 3 frames highlight

      setProgress("Running FFmpeg with freeze+highlight...");
      await ffmpeg.exec([
        "-y",
        "-i", "pitch.webm",
        "-i", "swing.webm",
        "-filter_complex",
        `
        [1:v]split=2[src][freezeSrc];
        [freezeSrc]trim=start_frame=${swingStart-1}:end_frame=${swingStart},setpts=PTS-STARTPTS,loop=${swingStart-1}:1:0[fz];
        [src]trim=start=${swingStartSec},setpts=PTS-STARTPTS[pl];
        [fz][pl]concat=n=2:v=1:a=0[hitter];

        [0:v]split=2[base][hl];
        [hl]eq=brightness=0.15:saturation=1.7[hlt];
        [base][hlt]overlay=enable='between(t,${swingStartSec},${swingStartSec + highlightDur})'[pitcher];

        [pitcher][hitter]hstack=inputs=2[v]
        `,
        "-map", "[v]",
        "-c:v", "libvpx",
        "-b:v", "1M",
        "out.webm",
      ]);

      setProgress("Reading output...");
      const data = await ffmpeg.readFile("out.webm");
      const out = new Blob([data.buffer], { type: "video/webm" });

      requestLoadVideoInTagger(out, `${selectedHitter} vs ${selectedPitcher}`);
      setProgress("Done!");
    } catch (err) {
      console.error("FFmpeg error:", err);
      setError(`Failed to generate video: ${err.message}`);
    } finally {
      setBusy(false);
      try {
        await ffmpeg.deleteFile("pitch.webm");
        await ffmpeg.deleteFile("swing.webm");
        await ffmpeg.deleteFile("out.webm");
      } catch {}
    }
  }

  return (
    <div>
      <h2>Matchup Simulator</h2>
      <div>
        <select value={selectedHitter} onChange={(e) => setSelectedHitter(e.target.value)}>
          <option value="">-- select hitter --</option>
          {hitters.map((h) => (
            <option key={h.name} value={h.name}>{h.name}</option>
          ))}
        </select>
        <select
          disabled={!selectedHitter}
          value={selectedSwingIndex ?? ""}
          onChange={(e) => setSelectedSwingIndex(Number(e.target.value))}
        >
          <option value="">-- select swing --</option>
          {swings.filter(s => s.hitterName === selectedHitter).map((s, i) => (
            <option key={i} value={i}>Swing {i + 1}</option>
          ))}
        </select>
        <select value={selectedPitcher} onChange={(e) => setSelectedPitcher(e.target.value)}>
          <option value="">-- select pitcher --</option>
          {pitchers.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select
          disabled={!selectedPitcher}
          value={selectedPitchIndex ?? ""}
          onChange={(e) => setSelectedPitchIndex(Number(e.target.value))}
        >
          <option value="">-- select pitch --</option>
          {pitcherPitches.map((pitch, i) => (
            <option key={i} value={i}>Pitch {i + 1}</option>
          ))}
        </select>
      </div>
      <button onClick={generateClip} disabled={busy}>
        Generate Side-by-Side
      </button>
      {progress && <div style={{ color: "blue" }}>{progress}</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}
