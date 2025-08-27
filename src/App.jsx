// src/App.jsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import CreateHitterForm from "./components/CreateHitterForm";
import CreatePitcherForm from "./components/CreatePitcherForm";
import AddSwingForm from "./components/AddSwingForm";
import AddPitchForm from "./components/AddPitchForm";
import MatchupSimulator from "./components/MatchupSimulator";
import VideoTagger from "./components/VideoTagger";
import {
  createHitter,
  findHitter,
  createPitcher,
  findPitcher,
} from "./utils/dataModel";

/* =============================================================================
   CONSTANTS
   ========================================================================== */
const FPS = 30;
const FLASH_FRAMES = 3;

/* =============================================================================
   LAYOUT
   ========================================================================== */
const SECTION_IDS = {
  MATCHUP: "matchup",
  ADD_SWING: "add_swing",
  ADD_PITCH: "add_pitch",
  HITTERS: "hitters",
  PITCHERS: "pitchers",
  TEAMS: "teams",
};
const LAYOUT_ORDER = [
  SECTION_IDS.MATCHUP,
  SECTION_IDS.ADD_SWING,
  SECTION_IDS.ADD_PITCH,
  SECTION_IDS.HITTERS,
  SECTION_IDS.PITCHERS,
  SECTION_IDS.TEAMS,
];

/* =============================================================================
   COLLAPSE STATE
   ========================================================================== */
const LS_COLLAPSE_KEY = "swingSync.collapse";
function loadCollapsedMap(defaults) {
  try {
    const raw = localStorage.getItem(LS_COLLAPSE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}
function saveCollapsedMap(map) {
  try {
    localStorage.setItem(LS_COLLAPSE_KEY, JSON.stringify(map));
  } catch {}
}

/* =============================================================================
   APP STATE PERSISTENCE
   ========================================================================== */
const LS_STATE_KEY = "SwingSync.state";

function loadAppState() {
  try {
    const raw = localStorage.getItem(LS_STATE_KEY);
    console.log("loadAppState raw:", raw);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    console.log("loadAppState parsed:", parsed);
    return {
      hitters: parsed.hitters || [],
      pitchers: parsed.pitchers || [],
      swings: parsed.swings || [],
      pitches: parsed.pitches || [],
      teams: parsed.teams || [],
    };
  } catch (e) {
    console.error("loadAppState error:", e);
    return null;
  }
}

function saveAppState(slices) {
  try {
    console.log("saveAppState saving:", slices);
    localStorage.setItem(LS_STATE_KEY, JSON.stringify(slices));
  } catch (e) {
    console.error("saveAppState error:", e);
  }
}

/* =============================================================================
   APP
   ========================================================================== */
export default function App() {
  const [hitters, setHitters] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [swings, setSwings] = useState([]);
  const [pitches, setPitches] = useState([]);
  const [teams, setTeams] = useState([]);

  const [activeVideoSource, setActiveVideoSource] = useState(null);
  const [activeVideoLabel, setActiveVideoLabel] = useState("");
  const [activeVideoFromMatchup, setActiveVideoFromMatchup] = useState(false);
  const currentObjectUrlRef = useRef(null);

  const [taggedSwingFrames, setTaggedSwingFrames] = useState({ startFrame: null, contactFrame: null });
  const [taggedPitchContactFrame, setTaggedPitchContactFrame] = useState(null);

  const [collapsedMap, setCollapsedMap] = useState(() =>
    loadCollapsedMap({
      [SECTION_IDS.MATCHUP]: false,
      [SECTION_IDS.ADD_SWING]: false,
      [SECTION_IDS.ADD_PITCH]: false,
      [SECTION_IDS.HITTERS]: false,
      [SECTION_IDS.PITCHERS]: false,
      [SECTION_IDS.TEAMS]: false,
    })
  );

  // hydration state to prevent overwrites
  const [hydrated, setHydrated] = useState(false);

  /* -------------------------- Load state once -------------------------- */
  useEffect(() => {
    console.log("useEffect loadAppState running…");
    const loaded = loadAppState();
    if (loaded) {
      setHitters(loaded.hitters);
      setPitchers(loaded.pitchers);
      setSwings(loaded.swings);
      setPitches(loaded.pitches);
      setTeams(loaded.teams);
    }
    setHydrated(true);
    console.log("hydration complete, hydrated =", true);
  }, []);

  /* -------------------------- Save state always ------------------------ */
  useEffect(() => {
    if (!hydrated) {
      console.log("saveAppState skipped, not hydrated yet");
      return;
    }
    saveAppState({ hitters, pitchers, swings, pitches, teams });
  }, [hydrated, hitters, pitchers, swings, pitches, teams]);

  /* ------------------------- Collapse toggles -------------------------- */
  const toggleSection = useCallback((id) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsedMap(next);
      return next;
    });
  }, []);
  const expandAll = useCallback(() => {
    const next = Object.fromEntries(Object.keys(collapsedMap).map((k) => [k, false]));
    setCollapsedMap(next); saveCollapsedMap(next);
  }, [collapsedMap]);
  const collapseAll = useCallback(() => {
    const next = Object.fromEntries(Object.keys(collapsedMap).map((k) => [k, true]));
    setCollapsedMap(next); saveCollapsedMap(next);
  }, [collapsedMap]);

  /* ---------------------- Video tagger plumbing ------------------------- */
  const revokeIfNeeded = useCallback(() => {
    if (currentObjectUrlRef.current) {
      try { URL.revokeObjectURL(currentObjectUrlRef.current); } catch {}
      currentObjectUrlRef.current = null;
    }
  }, []);
  useEffect(() => () => revokeIfNeeded(), [revokeIfNeeded]);

  const requestLoadVideoInTagger = useCallback((source, label = "", fromMatchup = false) => {
    setTaggedSwingFrames({ startFrame: null, contactFrame: null });
    setTaggedPitchContactFrame(null);
    setActiveVideoLabel(label || "");
    setActiveVideoFromMatchup(fromMatchup);

    if (!source) {
      revokeIfNeeded();
      setActiveVideoSource(null);
      return;
    }
    if (typeof source === "string") {
      revokeIfNeeded();
      currentObjectUrlRef.current = null;
      setActiveVideoSource(source);
      return;
    }
    try {
      const url = URL.createObjectURL(source);
      revokeIfNeeded();
      currentObjectUrlRef.current = url;
      setActiveVideoSource(url);
    } catch {
      revokeIfNeeded();
      setActiveVideoSource(null);
    }
  }, [revokeIfNeeded]);

  const handleTagSwing = useCallback(({ startFrame, contactFrame }) => {
    setTaggedSwingFrames({
      startFrame: Number.isFinite(startFrame) ? startFrame : null,
      contactFrame: Number.isFinite(contactFrame) ? contactFrame : null,
    });
  }, []);
  const handleTagPitchContact = useCallback((contactFrame) => {
    setTaggedPitchContactFrame(Number.isFinite(contactFrame) ? contactFrame : null);
  }, []);

  /* ---------------------------- CRUD ops ----------------------------- */
  const addHitter = (name, extra = {}) => {
    if (findHitter(hitters, name)) return false;
    const newHitter = { ...createHitter(name), ...extra };
    setHitters((prev) => [...prev, newHitter]);
    return true;
  };
  const deleteHitter = (name) => {
    setHitters((prev) => prev.filter((h) => h.name !== name));
    setSwings((prev) => prev.filter((s) => s.hitterName !== name));
  };
  const addPitcher = (name, extra = {}) => {
    if (findPitcher(pitchers, name)) return false;
    const newPitcher = { ...createPitcher(name), ...extra };
    setPitchers((prev) => [...prev, newPitcher]);
    return true;
  };
  const deletePitcher = (name) => {
    setPitchers((prev) => prev.filter((p) => p.name !== name));
    setPitches((prev) => prev.filter((pitch) => pitch.pitcherName !== name));
  };
  const addSwing = (hitterName, swingData) => {
    setSwings((prev) => [...prev, { hitterName, ...swingData }]);
  };
  const addPitch = (pitcherName, pitchData) => {
    setPitches((prev) => [...prev, { pitcherName, ...pitchData }]);
    revokeIfNeeded(); setActiveVideoSource(null);
  };
  const addTeam = (name, description = "") => {
    if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) return false;
    setTeams((prev) => [...prev, { name, description }]);
    return true;
  };
  const deleteTeam = (name) => {
    setTeams((prev) => prev.filter((t) => t.name !== name));
  };

  const constants = useMemo(() => ({ FPS, FLASH_FRAMES }), []);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif" }}>
      {/* LEFT */}
      <div style={{ flex: "0 0 460px", padding: "1rem", overflow: "auto", borderRight: "1px solid #ddd", background: "#fafafa" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src="/swing-sync-logo.png" alt="SwingSync Logo" style={{ height: 80, width: "auto" }} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={expandAll}>Expand All</button>
            <button onClick={collapseAll}>Collapse All</button>
          </div>
        </div>

        {LAYOUT_ORDER.map((secId) => {
          if (secId === SECTION_IDS.MATCHUP) {
            return (
              <SectionPanel key={secId} id={secId} title="Matchup Simulator" collapsed={collapsedMap[secId]} onToggle={toggleSection}>
                <MatchupSimulator
                  hitters={hitters}
                  swings={swings}
                  pitchers={pitchers}
                  pitches={pitches}
                  constants={constants}
                  requestLoadVideoInTagger={(src, lbl) => requestLoadVideoInTagger(src, lbl, true)}
                />
              </SectionPanel>
            );
          }
          if (secId === SECTION_IDS.ADD_SWING) {
            return (
              <SectionPanel key={secId} id={secId} title="Add Swing" collapsed={collapsedMap[secId]} onToggle={toggleSection}>
                <AddSwingForm
                  hitters={hitters}
                  onAddSwing={addSwing}
                  taggedStartFrame={taggedSwingFrames.startFrame}
                  taggedContactFrame={taggedSwingFrames.contactFrame}
                  clearTags={() => setTaggedSwingFrames({ startFrame: null, contactFrame: null })}
                  requestLoadVideoInTagger={requestLoadVideoInTagger}
                  constants={{ FPS }}
                  teams={teams}
                />
              </SectionPanel>
            );
          }
          if (secId === SECTION_IDS.ADD_PITCH) {
            return (
              <SectionPanel key={secId} id={secId} title="Add Pitch" collapsed={collapsedMap[secId]} onToggle={toggleSection}>
                <AddPitchForm
                  pitchers={pitchers}
                  onAddPitch={addPitch}
                  taggedContactFrame={taggedPitchContactFrame}
                  clearTag={() => setTaggedPitchContactFrame(null)}
                  requestLoadVideoInTagger={requestLoadVideoInTagger}
                  constants={{ FPS }}
                  teams={teams}
                />
              </SectionPanel>
            );
          }
          if (secId === SECTION_IDS.HITTERS) {
            return (
              <SectionPanel key={secId} id={secId} title="Hitter Maintenance" collapsed={collapsedMap[secId]} onToggle={toggleSection}>
                <CreateHitterForm onAddHitter={addHitter} teams={teams} />
                {hitters.map((h) => <div key={h.name}>{h.name} {h.teamName && `• ${h.teamName}`} {h.description}</div>)}
              </SectionPanel>
            );
          }
          if (secId === SECTION_IDS.PITCHERS) {
            return (
              <SectionPanel key={secId} id={secId} title="Pitcher Maintenance" collapsed={collapsedMap[secId]} onToggle={toggleSection}>
                <CreatePitcherForm pitchers={pitchers} onAddPitcher={addPitcher} onDeletePitcher={deletePitcher} teams={teams} />
              </SectionPanel>
            );
          }
          if (secId === SECTION_IDS.TEAMS) {
            return (
              <SectionPanel key={secId} id={secId} title="Teams" collapsed={collapsedMap[secId]} onToggle={toggleSection}>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const name = e.target.teamName.value.trim();
                  const desc = e.target.teamDesc.value.trim();
                  if (!name) return;
                  const ok = addTeam(name, desc);
                  if (ok) e.target.reset();
                }}>
                  <input type="text" name="teamName" placeholder="Team Name" />
                  <input type="text" name="teamDesc" placeholder="Description" />
                  <button type="submit">Add Team</button>
                </form>
                {teams.map((t) => (
                  <div key={t.name} style={{ marginTop: 4 }}>
                    <strong>{t.name}</strong> {t.description && `– ${t.description}`}
                    <button onClick={() => deleteTeam(t.name)} style={{ marginLeft: 8 }}>Delete</button>
                  </div>
                ))}
              </SectionPanel>
            );
          }
          return null;
        })}
      </div>

      {/* RIGHT */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <VideoTagger
          source={activeVideoSource}
          metadata={{ label: activeVideoLabel }}
          fps={FPS}
          onTagSwing={handleTagSwing}
          onTagPitchContact={handleTagPitchContact}
          showOverlay={!activeVideoFromMatchup}
        />
      </div>
    </div>
  );
}

/* =============================================================================
   SectionPanel
   ========================================================================== */
function SectionPanel({ id, title, collapsed, onToggle, children }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, marginBottom: "1rem", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem", background: "#f7f7f7" }}>
        <strong>{title}</strong>
        <button onClick={() => onToggle(id)}>{collapsed ? "Expand" : "Collapse"}</button>
      </div>
      {!collapsed && <div style={{ padding: "0.75rem" }}>{children}</div>}
    </div>
  );
}
