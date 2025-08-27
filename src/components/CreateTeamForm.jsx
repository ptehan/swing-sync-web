// src/components/CreateTeamForm.jsx
import React, { useState } from "react";

export default function CreateTeamForm({ teams = [], onAddTeam, onDeleteTeam }) {
  const [name, setName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    // prevent duplicates (case-insensitive)
    if (teams.some((t) => (t?.name || "").toLowerCase() === trimmed.toLowerCase())) {
      alert("Team with this name already exists.");
      return;
    }

    onAddTeam(trimmed);
    setName("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
      <h3>Create Team</h3>
      <input
        type="text"
        placeholder="Team Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit">Add Team</button>

      <ul>
        {teams.map((t) => (
          <li key={t.name}>
            {t.name}{" "}
            <button
              type="button"
              onClick={() => onDeleteTeam(t.name)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
