// src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import CreateHitterForm from "./components/CreateHitterForm";
import CreatePitcherForm from "./components/CreatePitcherForm";
import CreateTeamForm from "./components/CreateTeamForm";
import AddSwingForm from "./components/AddSwingForm";
import AddPitchForm from "./components/AddPitchForm";
import MatchupSimulator from "./components/MatchupSimulator";
import VideoTagger from "./components/VideoTagger";
import ClipsLibrary from "./components/ClipsLibrary";
import Modal from "./components/Modal";
import logo from "/swing-sync-logo.png";
import { deleteAllClips } from "./utils/dataModel";

import {
  createHitter,
  findHitter,
  createPitcher,
  findPitcher,
  deletePitchClip,
  deleteSwingClip,
  deleteMatchupClip,   // ✅ added
  getPitchClipBlob,
  getSwingClipBlob,
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
  const [matchups, setMatchups] = useState([]);
  const [openModal, setOpenModal] = useState(null);

  const [videoOpen, setVideoOpen] = useState(false);
  const [activeVideoSource, setActiveVideoSource] = useState(null);
  const [activeVideoLabel, setActiveVideoLabel] = useState("");
  const currentObjectUrlRef = useRef(null);

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
      setMatchups(loaded.matchups || []);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveAppState({ hitters, pitchers, swings, pitches, teams, matchups });
  }, [hydrated, hitters, pitchers, swings, pitches, teams, matchups]);

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
          await deleteSwingClip(target.videoKey);
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

      let count = -1;
      setPitches((prev) =>
        prev.filter((p) => {
          if (p.pitcherName !== pitcherName) return true;
          count++;
          return count !== filteredIndex;
        })
      );
    },
    [pitches]
  );

  const deleteMatchupItem = useCallback(
    async (index) => {
      setMatchups((prev) => {
        const target = prev[index];
        if (target?.videoKey) {
          deleteMatchupClip(target.videoKey).catch((e) =>
            console.warn("Failed to delete matchup clip", target.videoKey, e)
          );
        }
        return prev.filter((_, i) => i !== index);
      });
    },
    []
  );

  // ---------- UI ----------
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
        <button onClick={() => setOpenModal("matchup")}>Matchup Simulator</button>
        <button onClick={() => setOpenModal("swing")}>Add Swing</button>
        <button onClick={() => setOpenModal("pitch")}>Add Pitch</button>
        <button onClick={() => setOpenModal("hitters")}>Hitters</button>
        <button onClick={() => setOpenModal("pitchers")}>Pitchers</button>
        <button onClick={() => setOpenModal("teams")}>Teams</button>
        <button onClick={() => setOpenModal("clips")}>Clips Library</button>
        <button onClick={() => setVideoOpen(true)}>Video Player</button>
        <button
          style={{ background: "crimson", color: "white" }}
          onClick={() => {
            if (
              window.confirm(
                "Delete ALL saved clips (swings, pitches, matchups)?"
              )
            ) {
              deleteAllClips();
              setSwings([]);
              setPitches([]);
              setHitters([]);
              setPitchers([]);
              setMatchups([]);
              alert("All clips and state cleared.");
            }
          }}
        >
          Reset All Clips
        </button>
      </div>

      {/* Teams */}
      <Modal
        open={openModal === "teams"}
        onClose={() => setOpenModal(null)}
        title="Teams"
      >
        <CreateTeamForm onAddTeam={addTeam} onDeleteTeam={deleteTeam} teams={teams} />
      </Modal>

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
          matchups={matchups}
          setMatchups={setMatchups}
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
          onClose={() => setOpenModal(null)}
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
          onClose={() => setOpenModal(null)}
        />
      </Modal>

      {/* Hitters */}
      <Modal
        open={openModal === "hitters"}
        onClose={() => setOpenModal(null)}
        title="Hitters"
      >
        <CreateHitterForm onAddHitter={addHitter} teams={teams} />
      </Modal>

      {/* Pitchers */}
      <Modal
        open={openModal === "pitchers"}
        onClose={() => setOpenModal(null)}
        title="Pitchers"
      >
        <CreatePitcherForm
          pitchers={pitchers}
          pitches={pitches}
          onAddPitcher={addPitcher}
          onDeletePitcher={deletePitcher}
          onDeletePitch={deletePitchItem}
          requestLoadVideoInTagger={requestLoadVideoInTagger}
          teams={teams}
        />
      </Modal>

      {/* Clips Library */}
      <Modal
        open={openModal === "clips"}
        onClose={() => setOpenModal(null)}
        title="Clips Library"
      >
        <ClipsLibrary
          hitters={hitters}
          swings={swings}
          pitchers={pitchers}
          pitches={pitches}
          matchups={matchups}
          requestLoadVideoInTagger={requestLoadVideoInTagger}
          onDeleteSwing={deleteSwingItem}
          onDeletePitch={deletePitchItem}
          onDeleteMatchup={deleteMatchupItem}
        />
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
