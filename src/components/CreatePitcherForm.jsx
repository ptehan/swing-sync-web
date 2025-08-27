import React, { useState } from "react";

export default function CreatePitcherForm({
  pitchers = [],
  onAddPitcher,
  onDeletePitcher,
  teams = [],
}) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const dup = pitchers.some((p) =>
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
    typeof p === "string" ? p : (p?.name || "");
  const getPitcherId = (p) => p?.id ?? getPitcherName(p);

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

      <ul style={{ marginTop: 12 }}>
        {pitchers.map((p) => {
          const nm = getPitcherName(p);
          const id = getPitcherId(p);
          const tn = typeof p === "object" ? p?.teamName || "" : "";
          const desc = typeof p === "object" ? p?.description || "" : "";

          return (
            <li key={id} style={{ marginBottom: 4 }}>
              {nm}
              {tn ? ` — ${tn}` : ""}
              {desc ? ` — ${desc}` : ""}
              <button
                type="button"
                onClick={() => onDeletePitcher(id)}
                style={{ marginLeft: 6 }}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
