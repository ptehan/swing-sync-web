import React, { useState } from "react";

export default function CreateHitterForm({ onAddHitter, teams = [] }) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const ok = onAddHitter(trimmedName, {
      teamName: teamName || undefined,
      description: description.trim() || undefined,
    });

    if (ok) {
      setName("");
      setTeamName("");
      setDescription("");
    } else {
      alert("A hitter with that name already exists.");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <h3>Create Hitter</h3>

      <div style={{ marginBottom: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Hitter Name</div>
          <input
            type="text"
            placeholder="Hitter Name"
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

      <div style={{ marginBottom: 8 }}>
        <label>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Description (optional)
          </div>
          <input
            type="text"
            placeholder="e.g., Lefty with quick hands"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <button type="submit">Add Hitter</button>
    </form>
  );
}
