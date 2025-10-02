// src/components/ClipsLibrary.jsx
import React, { useEffect, useState } from "react";
import {
  getPitchClipBlob,
  getSwingClipBlob,
  getMatchupClipBlob,
  deleteMatchupClip,
  deletePitchClip,
  listMatchupClipKeys,
  deleteAllSwingClips,   // ✅ import the bulk delete
  listSwingClipKeys,     // ✅ so we can refresh after wipe
} from "../utils/dataModel";

// helper: guarantee the return value is a Blob with a video type
async function ensureVideoBlob(promise) {
  let blob = await promise;
  if (!blob) return null;
  if (!(blob instanceof Blob) || !blob.type) {
    blob = new Blob([blob], { type: "video/webm" });
  }
  return blob;
}

export default function ClipsLibrary({
  hitters,
  swings,
  pitchers,
  pitches,
  matchups,
  requestLoadVideoInTagger,
  onDeleteSwing,
  onDeletePitch,
  onDeleteMatchup,
}) {
  // local state mirrors props so we can update UI instantly on delete
  const [localSwings, setLocalSwings] = useState(swings);
  const [localPitches, setLocalPitches] = useState(pitches);
  const [localMatchups, setLocalMatchups] = useState(matchups);

  // ✅ new handler
  const handleDeleteAllSwings = async () => {
    if (!window.confirm("Delete ALL swings? This cannot be undone.")) return;
    await deleteAllSwingClips();
    const refreshed = await listSwingClipKeys(); // pull fresh keys after wipe
    setLocalSwings(refreshed); // empty array now
    alert("All swings deleted.");
  };

  return (
    <div>
      <h3>Clips Library</h3>

      {/* ✅ Add button to nuke swings */}
      <div style={{ marginBottom: "10px" }}>
        <button
          style={{ background: "red", color: "white", padding: "6px 12px" }}
          onClick={handleDeleteAllSwings}
        >
          Delete All Swings
        </button>
      </div>

      {/* your existing rendering of swings/pitches/matchups goes here */}
    </div>
  );
}
