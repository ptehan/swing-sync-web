// src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import CreateHitterForm from "./components/CreateHitterForm";
import AddSwingForm from "./components/AddSwingForm";
import AddPitchForm from "./components/AddPitchForm";
import MatchupSimulator from "./components/MatchupSimulator";
import VideoTagger from "./components/VideoTagger";
import Modal from "./components/Modal";
import logo from "/swing-sync-logo.png";

import {
  createHitter,
  findHitter,
  createPitcher,
  findPitcher,
  deletePitchClip,
  getPitchClipBlob,
  getSwingClipBlob,   // ✅ added for swing previews
} from "./utils/dataModel";

const FPS = 30;
const LS_STATE_KEY = "SwingSync.state";

// ---------- Storage ----------
function loadAppState() {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function saveAppState(slices) {
  try {
    localStorage.setItem(LS_STATE_KEY, JSON.stringify(slices));
  } catch {}
}

// ---------- Main ----------
export default function App() {
  const [hitters, setHitters] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [swings, setSwings] = useState([]);
  const [pitches, setPitches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const [openModal, setOpenModal] = useState(null);

  // 🔒 Video modal is independent so other modals (Matchup) stay open
  const [videoOpen, setVideoOpen] = useState(false);
  const [activeVideoSource, setActiveVideoSource] = useState(null);
  const [activeVideoLabel, setActiveVideoLabel] = useState("");
  const currentObjectUrlRef = useRef(null);

  // 🔧 Swing tags live at App level so AddSwingForm can see right-pane tags
  const [swingTagStart, setSwingTagStart] = useState(null);
  const [swingTagContact, setSwingTagContact] = useState(null);
  const clearSwingTags = useCallback(() => {
    setSwingTagStart(null);
    setSwingTagContact(null);
  }, []);

  // ---------- Load + Save ----------
  useEffect(() => {
    const loaded = loadAppState();
    if (loaded) {
      setHitters(loaded.hitters || []);
      setPitchers(loaded.pitchers || []);
      setSwings(loaded.swings || []);
      setPitches(loaded.pitches || []);
      setTeams(loaded.teams || []);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveAppState({ hitters, pitchers, swings, pitches, teams });
  }, [hydrated, hitters, pitchers, swings, pitches, teams]);

  // ---------- Video ----------
  const revokeIfNeeded = useCallback(() => {
    if (currentObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(currentObjectUrlRef.current);
      } catch {}
      currentObjectUrlRef.current = null;
    }
  }, []);
  useEffect(() => () => revokeIfNeeded(), [revokeIfNeeded]);

  // ✅ Open video modal without touching openModal (so Matchup stays open)
  const requestLoadVideoInTagger = useCallback(
    (source, label = "") => {
      setActiveVideoLabel(label || "");

      if (!source) {
        revokeIfNeeded();
        setActiveVideoSource(null);
        setVideoOpen(true);
        return;
      }

      if (typeof source === "string") {
        revokeIfNeeded();
        currentObjectUrlRef.current = null;
        setActiveVideoSource(source);
        setVideoOpen(true);
        return;
      }

      if (source instanceof File || source instanceof Blob) {
        try {
          const url = URL.createObjectURL(source);
          revokeIfNeeded();
          currentObjectUrlRef.current = url;
          setActiveVideoSource(url);
          setVideoOpen(true);
          return;
        } catch (err) {
          console.error("Error creating object URL for File/Blob:", err);
          revokeIfNeeded();
          setActiveVideoSource(null);
          setVideoOpen(true);
          return;
        }
      }

      console.warn("Unsupported video source passed:", source);
    },
    [revokeIfNeeded]
  );

  // ---------- CRUD ----------
  const addHitter = (name, extra = {}) => {
    if (findHitter(hitters, name)) return false;
    setHitters([...hitters, { ...createHitter(name), ...extra }]);
    return true;
  };

  const addPitcher = (name, extra = {}) => {
    if (findPitcher(pitchers, name)) return false;
    setPitchers([...pitchers, { ...createPitcher(name), ...extra }]);
    return true;
  };

  const addSwing = (hitterName, swingData) => {
    setSwings([...swings, { hitterName, ...swingData }]);
  };

  const addPitch = (pitcherName, pitchData) => {
    setPitches([...pitches, { pitcherName, ...pitchData }]);
  };

  const addTeam = (name, description = "") => {
    if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase()))
      return false;
    setTeams([...teams, { name, description }]);
    return true;
  };

  const deleteTeam = (name) =>
    setTeams(teams.filter((t) => t.name !== name));

  const deleteHitter = (name) => {
    setHitters(hitters.filter((h) => h.name !== name));
    setSwings(swings.filter((s) => s.hitterName !== name));
  };

  const deletePitcher = (name) => {
    setPitchers(pitchers.filter((p) => p.name !== name));
    setPitches(pitches.filter((pt) => pt.pitcherName !== name));
  };

  const deleteSwingItem = useCallback(
    async (globalIndex) => {
      const target = swings[globalIndex];
      if (!target) return;
      if (target.videoKey) {
        try {
          await deletePitchClip(target.videoKey);
        } catch (e) {
          console.warn("Failed to delete swing clip", target.videoKey, e);
        }
      }
      setSwings((prev) => prev.filter((_, idx) => idx !== globalIndex));
    },
    [swings]
  );

  const deletePitchItem = useCallback(
    async (pitcherName, filteredIndex) => {
      const list = pitches.filter((p) => p.pitcherName === pitcherName);
      const target = list[filteredIndex];
      if (!target) return;

      if (target.videoKey) {
        try {
          await deletePitchClip(target.videoKey);
        } catch (e) {
          console.warn("Failed to delete pitch clip", target.videoKey, e);
        }
      }

      let seen = -1;
      setPitches((prev) =>
        prev.filter((p) => {
          if (p.pitcherName !== pitcherName) return true;
          seen += 1;
          return seen !== filteredIndex;
        })
      );
    },
    [pitches]
  );

  // ---------- UI ----------
  const smallMeta = { fontSize: 12, opacity: 0.75 };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <img
        src={logo}
        alt="SwingSync Logo"
        style={{ height: 100, marginBottom: 20 }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 320,
        }}
      >
        <button onClick={() => setOpenModal("matchup")}>
          Matchup Simulator
        </button>
        <button onClick={() => setOpenModal("swing")}>Add Swing</button>
        <button onClick={() => setOpenModal("pitch")}>Add Pitch</button>
        <button onClick={() => setOpenModal("hitters")}>Hitters</button>
        <button onClick={() => setOpenModal("pitchers")}>Pitchers</button>
        <button onClick={() => setOpenModal("teams")}>Teams</button>
        <button onClick={() => setVideoOpen(true)}>Video Player</button>
      </div>

      {/* Matchup */}
      <Modal
        open={openModal === "matchup"}
        onClose={() => setOpenModal(null)}
        title="Matchup Simulator"
      >
        <MatchupSimulator
          hitters={hitters}
          swings={swings}
          pitchers={pitchers}
          pitches={pitches}
          requestLoadVideoInTagger={requestLoadVideoInTagger}
        />
      </Modal>

      {/* Add Swing */}
      <Modal
        open={openModal === "swing"}
        onClose={() => setOpenModal(null)}
        title="Add Swing"
      >
        <AddSwingForm
          hitters={hitters}
          onAddSwing={addSwing}
          teams={teams}
          constants={{ FPS }}
          requestLoadVideoInTagger={requestLoadVideoInTagger}
          taggedStartFrame={swingTagStart}
          taggedContactFrame={swingTagContact}
          clearTags={clearSwingTags}
        />
      </Modal>

      {/* Add Pitch */}
      <Modal
        open={openModal === "pitch"}
        onClose={() => setOpenModal(null)}
        title="Add Pitch"
      >
        <AddPitchForm
          pitchers={pitchers}
          onAddPitch={addPitch}
          teams={teams}
          constants={{ FPS }}
          requestLoadVideoInTagger={requestLoadVideoInTagger}
        />
      </Modal>

      {/* Hitters */}
      <Modal
        open={openModal === "hitters"}
        onClose={() => setOpenModal(null)}
        title="Hitters"
      >
        <CreateHitterForm onAddHitter={addHitter} teams={teams} />

        <div style={{ marginTop: 12 }}>
          {hitters.map((h) => {
            const globalIdxs = [];
            const swingsFor = [];
            swings.forEach((s, idx) => {
              if (s.hitterName === h.name) {
                globalIdxs.push(idx);
                swingsFor.push(s);
              }
            });

            return (
              <details
                key={h.name}
                style={{ borderBottom: "1px solid #eee", padding: "6px 0" }}
              >
                <summary style={{ cursor: "pointer", userSelect: "none" }}>
                  <strong>{h.name}</strong>{" "}
                  <span style={smallMeta}>
                    • {swingsFor.length} swing
                    {swingsFor.length === 1 ? "" : "s"}
                  </span>
                </summary>
                <div style={{ paddingLeft: 14, paddingTop: 6 }}>
                  {swingsFor.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      No swings.
                    </div>
                  ) : (
                    swingsFor.map((s, i) => {
                      const globalIndex = globalIdxs[i];
                      return (
                        <div
                          key={`${h.name}-swing-${i}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            padding: "2px 0",
                          }}
                        >
                          <span>
                            Swing {i + 1} —{" "}
                            {Number.isFinite(s.startFrame) &&
                            Number.isFinite(s.contactFrame)
                              ? `frames ${s.startFrame}→${s.contactFrame}`
                              : Number.isFinite(s.swingTime)
                              ? `time ${Number(s.swingTime).toFixed(3)}s`
                              : "time —"}
                            {s.videoKey ? " • saved" : " • no clip"}
                          </span>
                          {s.videoKey && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const blob = await getSwingClipBlob(s.videoKey);
                                  if (!blob) {
                                    alert("No clip found for this swing.");
                                    return;
                                  }
                                  requestLoadVideoInTagger(
                                    blob,
                                    `${h.name} Swing ${i + 1}`
                                  );
                                } catch (err) {
                                  console.error("Swing preview failed", err);
                                  alert("Failed to load swing preview.");
                                }
                              }}
                              style={{ fontSize: 12 }}
                            >
                              Preview
                            </button>
                          )}
                          <button
                            type="button"
                            style={{ marginLeft: "auto" }}
                            onClick={() => deleteSwingItem(globalIndex)}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </Modal>

      {/* Pitchers */}
      <Modal
        open={openModal === "pitchers"}
        onClose={() => setOpenModal(null)}
        title="Pitchers"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = e.currentTarget.pitcherName.value.trim();
            if (!name) return;
            if (!findPitcher(pitchers, name)) {
              setPitchers([...pitchers, { ...createPitcher(name) }]);
            }
            e.currentTarget.reset();
          }}
          style={{ display: "flex", gap: 8, marginBottom: 12 }}
        >
          <input
            name="pitcherName"
            type="text"
            placeholder="New pitcher name"
            style={{ flex: 1 }}
          />
          <button type="submit">Add</button>
        </form>

        <div style={{ marginTop: 4 }}>
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
                  <strong>{p.name}</strong>{" "}
                  <span style={smallMeta}>
                    • {pitchesFor.length} pitch
                    {pitchesFor.length === 1 ? "" : "es"}
                  </span>
                </summary>

                <div style={{ paddingLeft: 14, paddingTop: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPitchers(pitchers.filter((x) => x.name !== p.name));
                        setPitches(
                          pitches.filter((pt) => pt.pitcherName !== p.name)
                        );
                      }}
                      style={{ fontSize: 12 }}
                      title="Delete pitcher and their pitches"
                    >
                      Delete pitcher
                    </button>
                  </div>

                  {pitchesFor.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      No pitches.
                    </div>
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
                          style={{ marginLeft: "auto" }}
                          onClick={() => deletePitchItem(p.name, i)}
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
      </Modal>

      {/* Video modal */}
      <Modal
        open={videoOpen}
        onClose={() => {
          setVideoOpen(false);
          revokeIfNeeded();
          setActiveVideoSource(null);
          setActiveVideoLabel("");
        }}
        title="Video Player"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            maxHeight: "80vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <VideoTagger
            source={activeVideoSource}
            metadata={{ label: activeVideoLabel }}
            fps={FPS}
            onTagSwing={({ startFrame, contactFrame }) => {
              if (startFrame != null) setSwingTagStart(startFrame);
              if (contactFrame != null) setSwingTagContact(contactFrame);
            }}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
      </Modal>
    </div>
  );
}
