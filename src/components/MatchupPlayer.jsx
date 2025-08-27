// src/components/MatchupPlayer.jsx
import React, { useState, useRef } from "react";

export default function MatchupPlayer({ swings, pitches }) {
  const [selectedSwing, setSelectedSwing] = useState(null);
  const [selectedPitch, setSelectedPitch] = useState(null);
  const videoRef = useRef(null);

  const fps = 30; // keep consistent
  const flashDuration = 10; // frames

  const handlePlay = () => {
    if (!selectedSwing || !selectedPitch) return;

    const { swingTime } = selectedSwing;
    const { clipUrl, contactFrame } = selectedPitch;

    const swingStartFrame = contactFrame - Math.floor(swingTime * fps);

    const video = videoRef.current;
    if (video) {
      video.currentTime = (contactFrame - fps * 2) / fps; // 2s before contact
      video.play();

      // flash at swing start
      const checkFrame = () => {
        const currentFrame = Math.floor(video.currentTime * fps);
        if (currentFrame >= swingStartFrame &&
            currentFrame <= swingStartFrame + flashDuration) {
          document.getElementById("flash-overlay").style.display = "block";
        } else {
          document.getElementById("flash-overlay").style.display = "none";
        }
        requestAnimationFrame(checkFrame);
      };
      requestAnimationFrame(checkFrame);
    }
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2>Matchup</h2>

      <div style={{ display: "flex", gap: "1rem" }}>
        {/* Swing dropdown */}
        <select onChange={(e) => setSelectedSwing(JSON.parse(e.target.value))}>
          <option value="">Select Swing</option>
          {swings.map((s, i) => (
            <option key={i} value={JSON.stringify(s)}>
              {s.hitterName} – {s.swingTime}s
            </option>
          ))}
        </select>

        {/* Pitch dropdown */}
        <select onChange={(e) => setSelectedPitch(JSON.parse(e.target.value))}>
          <option value="">Select Pitch</option>
          {pitches.map((p, i) => (
            <option key={i} value={JSON.stringify(p)}>
              {p.pitcherName} – Frame {p.contactFrame}
            </option>
          ))}
        </select>

        <button onClick={handlePlay}>Play Matchup</button>
      </div>

      {/* Video with overlay */}
      {selectedPitch && (
        <div style={{ position: "relative", marginTop: "1rem" }}>
          <video
            ref={videoRef}
            src={selectedPitch.clipUrl}
            width="480"
            controls
          />
          <div
            id="flash-overlay"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(255, 0, 0, 0.6)",
              display: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
