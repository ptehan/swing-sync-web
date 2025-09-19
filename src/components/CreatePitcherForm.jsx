// src/components/CreatePitcherForm.jsx
import React, { useState } from "react";
import { getPitchClipBlob } from "../utils/dataModel";

export default function CreatePitcherForm({
  pitchers = [],
  pitches = [],
  onAddPitcher,
  onDeletePitcher,
  onDeletePitch,
  requestLoadVideoInTagger,
  teams = [],
}) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const ok = onAddPitcher(trimmedName, {
      teamName: teamName || undefined,
      description: description.trim() || undefined,
    });

    if (ok) {
      setName("");
      setTeamName("");
      setDescription("");
    } else {
      alert("A pitcher with that name already exists.");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <h3>Create Pitcher</h3>

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

      <div style={{ marginTop: 12 }}>
        {pitchers.map((p) => {
          const pitchesFor = pitches.filter(
            (pt) => pt.pitcherName === p.name
          );
          return (
            <details
              key={p.name}
              style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}
            >
              <summary style={{ cursor: "pointer", userSelect: "none" }}>
                <strong>{p.name}</strong>
                {p.teamName ? ` — ${p.teamName}` : ""}
                {p.description ? ` (${p.description})` : ""}
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {" "}
                  • {pitchesFor.length} pitch
                  {pitchesFor.length === 1 ? "" : "es"}
                </span>
                <button
                  type="button"
                  onClick={() => onDeletePitcher(p.name)}
                  style={{ marginLeft: 8, fontSize: 12 }}
                >
                  Delete Pitcher
                </button>
              </summary>

              <div style={{ paddingLeft: 14, paddingTop: 6 }}>
                {pitchesFor.length === 0 ? (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>No pitches.</div>
                ) : (
                  pitchesFor.map((pt, i) => (
                    <div
                      key={`${p.name}-pitch-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 12,
                        padding: "2px 0",
                      }}
                    >
                      <span>
                        Pitch {i + 1} — contact {pt.contactFrame}
                        {pt.videoKey ? " • saved" : " • no clip"}
                      </span>
                      {pt.videoKey && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const blob = await getPitchClipBlob(pt.videoKey);
                              if (!blob) {
                                alert("No clip found for this pitch.");
                                return;
                              }
                              requestLoadVideoInTagger(
                                blob,
                                `${p.name} Pitch ${i + 1}`
                              );
                            } catch (err) {
                              console.error("Pitch preview failed", err);
                              alert("Failed to load pitch preview.");
                            }
                          }}
                          style={{ fontSize: 12 }}
                        >
                          Preview
                        </button>
                      )}
                      <button
                        type="button"
                        style={{ marginLeft: "auto", fontSize: 12 }}
                        onClick={() => onDeletePitch(p.name, i)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </details>
          );
        })}
      </div>
    </form>
  );
}
