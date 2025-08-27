// src/components/AddSwingForm.jsx
import React, { useState } from "react";

/* =============================================================================
   AddSwingForm
   -----------------------------------------------------------------------------
   Lets you add a swing for a hitter. Expects parent to handle saving.
   Now includes a "Load Swing Video" button to send video to VideoTagger.
   ========================================================================== */

export default function AddSwingForm({
  hitters = [],
  onAddSwing,
  taggedStartFrame,
  taggedContactFrame,
  clearTags,
  requestLoadVideoInTagger,
  constants = { FPS: 30 },
}) {
  const [hitterName, setHitterName] = useState("");
  const [swingTime, setSwingTime] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!hitterName) {
      alert("Please select a hitter.");
      return;
    }

    // Prepare swing payload
    const data = {
      startFrame: taggedStartFrame ?? null,
      contactFrame: taggedContactFrame ?? null,
      swingTime: swingTime ? Number(swingTime) : null,
      description: description.trim() || undefined,
    };

    onAddSwing(hitterName, data);

    // Reset
    setSwingTime("");
    setDescription("");
    clearTags();
  };

  const handleLoadVideo = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      requestLoadVideoInTagger(file, `Swing for ${hitterName || "unknown hitter"}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <h3>Add Swing</h3>

      {/* Hitter selection */}
      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Hitter</div>
          <select
            value={hitterName}
            onChange={(e) => setHitterName(e.target.value)}
          >
            <option value="">— Select hitter —</option>
            {hitters.map((h) => (
              <option key={h.name} value={h.name}>
                {h.name}
                {h.teamName ? ` • ${h.teamName}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Load swing video */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, opacity: 0.85, display: "block" }}>
          Load Swing Video
        </label>
        <input type="file" accept="video/*" onChange={handleLoadVideo} />
      </div>

      {/* Swing time */}
      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Swing Time (s)</div>
          <input
            type="number"
            step="0.001"
            placeholder="optional"
            value={swingTime}
            onChange={(e) => setSwingTime(e.target.value)}
          />
        </label>
      </div>

      {/* Description */}
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Description (optional)
          </div>
          <input
            type="text"
            placeholder="e.g., leg kick, quick load"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      {/* Tagged frames info */}
      {(taggedStartFrame != null || taggedContactFrame != null) && (
        <div
          style={{
            fontSize: 12,
            marginBottom: 12,
            padding: "4px 6px",
            background: "#f0f0f0",
            borderRadius: 4,
          }}
        >
          Tagged Frames: {taggedStartFrame ?? "—"} →{" "}
          {taggedContactFrame ?? "—"}
          <button
            type="button"
            onClick={clearTags}
            style={{ marginLeft: 8, fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      )}

      <button type="submit">Add Swing</button>
    </form>
  );
}
