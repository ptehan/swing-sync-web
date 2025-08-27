import React, { useState } from "react";

function PitcherForm({ onCreate, onAddPitch, openVideo }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [contactFrame, setContactFrame] = useState(null);

  const handleCreate = () => {
    if (!name) {
      alert("Enter a pitcher name.");
      return;
    }
    onCreate(name);
    setName("");
  };

  const handleSavePitch = () => {
    if (!name) {
      alert("Enter a pitcher name.");
      return;
    }
    if (contactFrame === null) {
      alert("Tag a contact frame.");
      return;
    }
    if (!file) {
      alert("Upload a video for this pitch.");
      return;
    }

    onAddPitch(name, { contactFrame, file });

    // reset
    setFile(null);
    setContactFrame(null);
  };

  return (
    <div style={{ fontSize: "12px" }}>
      <input
        placeholder="Pitcher Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: "90%", marginBottom: "4px" }}
      />
      <button onClick={handleCreate} style={{ marginBottom: "6px" }}>
        ➕ Create Pitcher
      </button>
      <br />

      <input
        type="file"
        accept="video/*"
        onChange={(e) => {
          const f = e.target.files[0];
          setFile(f);
          if (f) {
            openVideo({ type: "pitcher", file: f, setContactFrame });
          }
        }}
        style={{ marginBottom: "6px" }}
      />
      <button onClick={handleSavePitch}>💾 Save Pitch</button>
    </div>
  );
}

export default PitcherForm;
