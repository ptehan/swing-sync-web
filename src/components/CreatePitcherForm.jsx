import React, { useState } from "react";
import { getPitchClipBlob } from "../utils/dataModel";

export default function CreatePitcherForm({
  pitchers = [],
  onAddPitcher,
  onDeletePitcher,
  teams = [],
}) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [description, setDescription] = useState("");
  const [previewInfo, setPreviewInfo] = useState({}); // videoKey -> { url, error }

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const dup = pitchers.some(
      (p) =>
        (typeof p === "string" ? p : (p?.name || "")).toLowerCase() ===
        trimmed.toLowerCase()
    );
    if (dup) {
      alert("Pitcher with this name already exists.");
      return;
    }

    const res = onAddPitcher(trimmed, {
      teamName: teamName || undefined,
      description: description.trim() || undefined,
    });

    if (res === false) {
      alert("Pitcher with this name already exists.");
      return;
    }

    setName("");
    setTeamName("");
    setDescription("");
  };

  const getPitcherName = (p) =>
    typeof p === "string" ? p : p?.name || "";
  const getPitcherId = (p) => p?.id ?? getPitcherName(p);

  async function handlePreview(pitch) {
    if (!pitch.videoKey) {
      setPreviewInfo((prev) => ({
        ...prev,
        [pitch.contactFrame]: { error: "No video key stored for this pitch" },
      }));
      return;
    }
    try {
      const blob = await getPitchClipBlob(pitch.videoKey);
      if (!blob) {
        setPreviewInfo((prev) => ({
          ...prev,
          [pitch.videoKey]: { error: "No clip found in DB" },
        }));
        return;
      }
      const url = URL.createObjectURL(blob);
      setPreviewInfo((prev) => ({
        ...prev,
        [pitch.videoKey]: { url },
      }));
    } catch (err) {
      setPreviewInfo((prev) => ({
        ...prev,
        [pitch.videoKey]: { error: "Error loading clip" },
      }));
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <h3>Create Pitcher TEST</h3>

      <div style={{ marginBottom: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Pitcher Name</div>
          <input
            type="text"
            placeholder="Pitcher Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Team</div>
          <select
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          >
            <option value="">— No team —</option>
            {teams.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
                {t.description ? ` – ${t.description}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Description (optional)
          </div>
          <input
            type="text"
            placeholder="e.g., RHP, heavy sinker"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <button type="submit">Add Pitcher</button>

      {/* --- Pitcher List --- */}
      <ul style={{ marginTop: 12 }}>
        {pitchers.map((p) => {
          const nm = getPitcherName(p);
          const id = getPitcherId(p);
          const tn = typeof p === "object" ? p?.teamName || "" : "";
          const desc = typeof p === "object" ? p?.description || "" : "";

          return (
            <li key={id} style={{ marginBottom: 8 }}>
              <div>
                <strong>{nm}</strong>
                {tn ? ` — ${tn}` : ""}
                {desc ? ` — ${desc}` : ""}
                <button
                  type="button"
                  onClick={() => onDeletePitcher(id)}
                  style={{ marginLeft: 6 }}
                >
                  Delete
                </button>
              </div>

              {/* ✅ Always show pitches */}
              {p.pitches && p.pitches.length > 0 && (
                <ul style={{ marginLeft: 16, fontSize: 13 }}>
                  {p.pitches.map((pitch, i) => {
                    const key = pitch.videoKey || `cf_${pitch.contactFrame}_${i}`;
                    const info = previewInfo[pitch.videoKey] || previewInfo[pitch.contactFrame] || {};
                    return (
                      <li key={key} style={{ marginBottom: 6 }}>
                        Pitch {i + 1} — contactFrame: {pitch.contactFrame}
                        <button
                          type="button"
                          style={{ marginLeft: 6 }}
                          onClick={() => handlePreview(pitch)}
                        >
                          Preview
                        </button>
                        {info.error && (
                          <div style={{ color: "crimson", fontSize: 12 }}>
                            {info.error}
                          </div>
                        )}
                        {info.url && (
                          <div style={{ marginTop: 4 }}>
                            <video
                              src={info.url}
                              controls
                              style={{ maxWidth: "320px", display: "block" }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </form>
  );
}
