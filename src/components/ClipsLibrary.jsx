// src/components/ClipsLibrary.jsx
import React, { useEffect, useState } from "react";
import {
  getPitchClipBlob,
  getSwingClipBlob,
  getMatchupClipBlob,
  deleteMatchupClip,
  deletePitchClip,
  listMatchupClipKeys,
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
  const [localSwings, setLocalSwings] = useState(swings);
  const [localPitches, setLocalPitches] = useState(pitches);
  const [localMatchups, setLocalMatchups] = useState(matchups);

  useEffect(() => setLocalSwings(swings), [swings]);
  useEffect(() => setLocalPitches(pitches), [pitches]);
  useEffect(() => setLocalMatchups(matchups), [matchups]);

  // 🔥 auto-delete orphaned matchups
  useEffect(() => {
    async function cleanOrphans() {
      const allKeys = await listMatchupClipKeys();
      const liveKeys = new Set(localMatchups.map((m) => m.videoKey));
      const orphans = allKeys.filter((k) => !liveKeys.has(k));

      for (const key of orphans) {
        try {
          await deleteMatchupClip(key);
          console.log("Deleted orphaned matchup:", key);
        } catch (err) {
          console.error("Failed to delete orphaned matchup:", key, err);
        }
      }
    }
    cleanOrphans();
  }, [localMatchups]);

  function renderMatchupRow(m, i) {
    const swingObj = localSwings.find(
      (s, idx) => s.hitterName === m.hitterName && idx === m.swingIndex
    );
    const pitchObj = localPitches.find(
      (pt, idx) => pt.pitcherName === m.pitcherName && idx === m.pitchIndex
    );

    const swingDetail = swingObj?.swingTime
      ? `time ${swingObj.swingTime.toFixed(3)}s`
      : "no time";

    const pitchDetail = pitchObj?.description || "no description";

    const clipType = m.videoKey?.includes("sideBySide")
      ? "Side-by-Side"
      : "Pitcher-Only";

    const globalIdx =
      typeof m.globalIndex === "number" ? m.globalIndex : i;

    return (
      <div
        key={`matchup-${globalIdx}`}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ flex: 1 }}>
          {m.hitterName} — Swing {m.swingIndex + 1} ({swingDetail}) vs{" "}
          {m.pitcherName} — Pitch {m.pitchIndex + 1} ({pitchDetail}) • {clipType}
        </span>
        <button
          type="button"
          onClick={async () => {
            const blob = await ensureVideoBlob(getMatchupClipBlob(m.videoKey));
            if (!blob) return alert("No clip found.");
            requestLoadVideoInTagger(
              blob,
              `Matchup: ${m.hitterName} vs ${m.pitcherName}`
            );
          }}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={async () => {
            if (window.confirm("Delete this matchup?")) {
              try {
                if (m.videoKey) {
                  await deleteMatchupClip(m.videoKey);
                }
                setLocalMatchups((prev) =>
                  prev.filter((_, idx) => idx !== i)
                );
                onDeleteMatchup(globalIdx);
              } catch (err) {
                console.error("Delete matchup failed:", err);
                alert("Failed to delete matchup from storage.");
              }
            }
          }}
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Swings + Matchups by Hitter */}
      <div>
        <h3>Swings & Matchups by Hitter</h3>
        {hitters.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No hitters added.</div>
        ) : (
          hitters.map((h) => {
            const swingsFor = localSwings
              .map((s, idx) => ({ ...s, globalIndex: idx }))
              .filter((s) => s.hitterName === h.name);

            const matchupsFor = localMatchups
              .map((m, idx) => ({ ...m, globalIndex: idx }))
              .filter((m) => m.hitterName === h.name);

            return (
              <details key={h.name}>
                <summary>
                  <strong>{h.name}</strong> • {swingsFor.length} swings,{" "}
                  {matchupsFor.length} matchups
                </summary>
                <div style={{ paddingLeft: 14 }}>
                  {/* Swings */}
                  {swingsFor.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>No swings.</div>
                  ) : (
                    swingsFor.map((s, i) => (
                      <div
                        key={`${h.name}-swing-${i}`}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span style={{ flex: 1 }}>
                          Swing {i + 1} • {s.videoKey ? "saved" : "no clip"}
                          {s.description ? ` — ${s.description}` : ""}
                        </span>
                        {s.videoKey && (
                          <button
                            type="button"
                            onClick={async () => {
                              const blob = await ensureVideoBlob(
                                getSwingClipBlob(s.videoKey)
                              );
                              if (!blob) return alert("No clip found.");
                              requestLoadVideoInTagger(
                                blob,
                                `${h.name} Swing ${i + 1}`
                              );
                            }}
                          >
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this swing?")) {
                              setLocalSwings((prev) =>
                                prev.filter((_, idx) => idx !== s.globalIndex)
                              );
                              onDeleteSwing(s.globalIndex);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}

                  {/* Matchups */}
                  {matchupsFor.length === 0 ? null : (
                    <>
                      <div style={{ marginTop: 6, fontWeight: "bold" }}>
                        Matchups
                      </div>
                      {matchupsFor.map((m, i) => renderMatchupRow(m, i))}
                    </>
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>

      {/* Pitches + Matchups by Pitcher */}
      <div>
        <h3>Pitches & Matchups by Pitcher</h3>
        {pitchers.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No pitchers added.</div>
        ) : (
          pitchers.map((p) => {
            const pitchesFor = localPitches.filter((pt) => pt.pitcherName === p.name);
            const matchupsFor = localMatchups
              .map((m, idx) => ({ ...m, globalIndex: idx }))
              .filter((m) => m.pitcherName === p.name);

            return (
              <details key={p.name}>
                <summary>
                  <strong>{p.name}</strong> • {pitchesFor.length} pitches,{" "}
                  {matchupsFor.length} matchups
                </summary>
                <div style={{ paddingLeft: 14 }}>
                  {/* Pitches */}
                  {pitchesFor.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>No pitches.</div>
                  ) : (
                    pitchesFor.map((pt, i) => (
                      <div
                        key={`${p.name}-pitch-${i}`}
                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                      >
                        <span style={{ flex: 1 }}>
                          Pitch {i + 1} • {pt.videoKey ? "saved" : "no clip"}
                          {pt.description ? ` — ${pt.description}` : ""}
                        </span>
                        {pt.videoKey && (
                          <button
                            type="button"
                            onClick={async () => {
                              const blob = await ensureVideoBlob(
                                getPitchClipBlob(pt.videoKey)
                              );
                              if (!blob) return alert("No clip found.");
                              requestLoadVideoInTagger(
                                blob,
                                `${p.name} Pitch ${i + 1}`
                              );
                            }}
                          >
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm("Delete this pitch?")) {
                              try {
                                if (pt.videoKey) {
                                  await deletePitchClip(pt.videoKey);
                                }
                                setLocalPitches((prev) =>
                                  prev.filter((_, idx) => !(pt.pitcherName === p.name && idx === i))
                                );
                                onDeletePitch(p.name, i);
                              } catch (err) {
                                console.error("Delete pitch failed:", err);
                                alert("Failed to delete pitch from storage.");
                              }
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}

                  {/* Matchups */}
                  {matchupsFor.length === 0 ? null : (
                    <>
                      <div style={{ marginTop: 6, fontWeight: "bold" }}>
                        Matchups
                      </div>
                      {matchupsFor.map((m, i) => renderMatchupRow(m, i))}
                    </>
                  )}
                </div>
              </details>
            );
          })
        )}
      </div>

      {/* Master Matchups List */}
      <div>
        <h3>All Matchups</h3>
        {localMatchups.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No matchups saved.</div>
        ) : (
          localMatchups.map((m, i) => renderMatchupRow(m, i))
        )}
      </div>
    </div>
  );
}
