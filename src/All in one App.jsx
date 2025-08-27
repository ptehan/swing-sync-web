import React, { useState, useRef } from "react";
import GIF from "gif.js.optimized"; // <-- added

function App() {
  const [hitters, setHitters] = useState([]);
  const [pitchers, setPitchers] = useState([]);
  const [selectedHitter, setSelectedHitter] = useState("");
  const [selectedPitcher, setSelectedPitcher] = useState("");
  const [activeVideo, setActiveVideo] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [gifUrl, setGifUrl] = useState(null); // <-- added

  const canvasRef = useRef(null);

  const addHitter = (name, swingTime, file, startFrame, contactFrame) => {
    let finalTime = swingTime && !isNaN(swingTime) ? swingTime : null;

    if (!finalTime && startFrame !== null && contactFrame !== null) {
      finalTime = ((contactFrame - startFrame) / 30) * 1000;
    }

    if (!finalTime) {
      alert("Enter a swing time OR tag both start + contact frames.");
      return;
    }

    setHitters([...hitters, { name, swingTime: finalTime, file, startFrame, contactFrame }]);
    alert(`Saved hitter ${name} with swing time ${Math.round(finalTime)} ms`);
    setActiveVideo(null);
  };

  const addPitcher = (name, file, contactFrame) => {
    setPitchers([...pitchers, { name, file, contactFrame }]);
    alert(`Saved pitcher ${name} with contact frame ${contactFrame}`);
    setActiveVideo(null);
  };

  const deleteHitter = (name) => setHitters(hitters.filter((h) => h.name !== name));
  const deletePitcher = (name) => setPitchers(pitchers.filter((p) => p.name !== name));

  const runMatchup = () => {
    const hitter = hitters.find((h) => h.name === selectedHitter);
    const pitcher = pitchers.find((p) => p.name === selectedPitcher);

    if (!hitter || !pitcher) {
      alert("Select a hitter and pitcher first!");
      return;
    }
    if (!pitcher.contactFrame) {
      alert("Pitcher has no contact frame tagged.");
      return;
    }
    if (!hitter.swingTime) {
      alert("Hitter has no swing time set or tagged.");
      return;
    }

    const fps = 30;
    const swingFrames = Math.round((hitter.swingTime / 1000) * fps);
    const startFrame = pitcher.contactFrame - swingFrames;

    const video = document.createElement("video");
    video.src = URL.createObjectURL(pitcher.file);
    video.onloadeddata = () => {
      const time = startFrame / fps;
      video.currentTime = Math.max(time, 0);

      video.onseeked = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // overlay text lines
        const lines = [
          `Hitter: ${hitter.name}`,
          `Swing Time: ${Math.round(hitter.swingTime)} ms`,
          `Pitcher: ${pitcher.name}`,
        ];
        const fontSize = 16;
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = "white";

        const padding = 10;
        const lineHeight = fontSize + 6;
        const boxWidth =
          Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2;
        const boxHeight = lines.length * lineHeight + padding * 2;

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(10, 10, boxWidth, boxHeight);

        ctx.fillStyle = "white";
        lines.forEach((line, i) => {
          ctx.fillText(line, 10 + padding, 10 + padding + (i + 1) * lineHeight - 4);
        });

        const imgData = canvas.toDataURL("image/png");
        setResultImage(imgData);
        setActiveVideo(null);
      };
    };
  };

  const exportImage = () => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = "matchup.png";
    a.click();
  };

  // === NEW: Export animated GIF ===
const exportGif = () => {
  const hitter = hitters.find((h) => h.name === selectedHitter);
  const pitcher = pitchers.find((p) => p.name === selectedPitcher);
  if (!hitter || !pitcher) {
    alert("Select a hitter + pitcher first!");
    return;
  }

  const fps = 30;
  const swingFrames = Math.round((hitter.swingTime / 1000) * fps);
  const startFrame = pitcher.contactFrame - swingFrames;

  // extend capture
  const preBuffer = 10;   // frames before swing start
  const postBuffer = 15;  // frames after contact
  const firstFrame = Math.max(startFrame - preBuffer, 0);
  const lastFrame = pitcher.contactFrame + postBuffer;

  const video = document.createElement("video");
  video.src = URL.createObjectURL(pitcher.file);

  video.onloadedmetadata = () => {
    const fullW = video.videoWidth;
    const fullH = video.videoHeight;

    // shrink output GIF size
    const scale = 0.5; // 50% smaller, tweak as needed
    const outW = Math.round(fullW * scale);
    const outH = Math.round(fullH * scale);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = outW;
    canvas.height = outH;

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: outW,
      height: outH,
    });

    let currentFrame = firstFrame;
    function captureNext() {
      if (currentFrame > lastFrame) {
        // pause at last frame
        gif.addFrame(ctx, { copy: true, delay: 1000 });
        gif.render();
        return;
      }
      video.currentTime = currentFrame / fps;
      video.onseeked = () => {
        // draw video scaled down
        ctx.drawImage(video, 0, 0, outW, outH);

        // 🔥 strong flash at swing start for multiple frames
        if (currentFrame >= startFrame && currentFrame < startFrame + 3) {
          ctx.fillStyle = "rgba(255, 0, 0, 0.35)"; // semi-transparent red overlay
          ctx.fillRect(0, 0, outW, outH);
        }

        gif.addFrame(ctx, { copy: true, delay: 1000 / fps });
        currentFrame++;
        setTimeout(captureNext, 20);
      };
    }

    gif.on("finished", (blob) => {
      const url = URL.createObjectURL(blob);
      setGifUrl(url);
    });

    captureNext();
  };
};

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Arial, sans-serif" }}>
      {/* LEFT PANEL */}
      <div
        style={{
          width: "300px",
          padding: "10px",
          borderRight: "1px solid #ccc",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h2 style={{ fontSize: "16px", marginBottom: "10px" }}>⚾ Swing Sync</h2>

        <Section title="Matchup">
          <div>
            <select onChange={(e) => setSelectedHitter(e.target.value)}>
              <option value="">Select Hitter</option>
              {hitters.map((h) => (
                <option key={h.name} value={h.name}>
                  {h.name}
                </option>
              ))}
            </select>
            <select onChange={(e) => setSelectedPitcher(e.target.value)}>
              <option value="">Select Pitcher</option>
              {pitchers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={runMatchup}>Run Matchup</button>
          </div>
        </Section>

        <Section title="Add Hitter">
          <HitterForm onSave={addHitter} openVideo={setActiveVideo} />
        </Section>
        <Section title="Add Pitcher">
          <PitcherForm onSave={addPitcher} openVideo={setActiveVideo} />
        </Section>

        <Section title="Manage Players">
          <h4 style={{ fontSize: "12px", marginBottom: "5px" }}>Hitters</h4>
          <ul style={{ fontSize: "11px" }}>
            {hitters.map((h) => (
              <li key={h.name}>
                {h.name} — {Math.round(h.swingTime)} ms{" "}
                <button onClick={() => deleteHitter(h.name)} style={{ fontSize: "10px" }}>
                  ❌
                </button>
              </li>
            ))}
          </ul>
          <h4 style={{ fontSize: "12px", marginBottom: "5px" }}>Pitchers</h4>
          <ul style={{ fontSize: "11px" }}>
            {pitchers.map((p) => (
              <li key={p.name}>
                {p.name} — Frame {p.contactFrame}{" "}
                <button onClick={() => deletePitcher(p.name)} style={{ fontSize: "10px" }}>
                  ❌
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, padding: "10px", overflow: "auto" }}>
        {activeVideo ? (
          <VideoTagger {...activeVideo} />
        ) : resultImage ? (
          <div>
            <div
              style={{
                width: "100%",
                maxHeight: "80vh",
                overflow: "auto",
                border: "1px solid #ccc",
                borderRadius: "8px",
              }}
            >
              <img
                src={resultImage}
                alt="Result frame"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  margin: "0 auto",
                }}
              />
            </div>
            <div style={{ marginTop: "10px" }}>
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                ➖ Zoom Out
              </button>
              <button onClick={() => setZoom((z) => z + 0.25)}>➕ Zoom In</button>
              <button onClick={exportImage}>💾 Export Image</button>
              <button onClick={exportGif}>🎞 Export GIF</button>
            </div>
            {gifUrl && (
              <div style={{ marginTop: "10px" }}>
                <img src={gifUrl} alt="Matchup GIF" style={{ maxWidth: "100%" }} />
                <a href={gifUrl} download="matchup.gif">💾 Download GIF</a>
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: "14px", color: "#666" }}>
            Upload a video or run a matchup to see results here.
          </p>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <h3 style={{ fontSize: "14px", margin: "5px 0" }}>{title}</h3>
      {children}
    </div>
  );
}

function HitterForm({ onSave, openVideo }) {
  const [name, setName] = useState("");
  const [swingTime, setSwingTime] = useState("");
  const [file, setFile] = useState(null);
  const [startFrame, setStartFrame] = useState(null);
  const [contactFrame, setContactFrame] = useState(null);

  const save = () => {
    const parsed = swingTime ? parseInt(swingTime, 10) : null;
    onSave(name, parsed, file, startFrame, contactFrame);
    setName("");
    setSwingTime("");
    setFile(null);
    setStartFrame(null);
    setContactFrame(null);
  };

  return (
    <div>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "90%" }} />
      <input
        placeholder="Swing time (ms)"
        value={swingTime}
        onChange={(e) => setSwingTime(e.target.value)}
        style={{ width: "90%" }}
      />
      <input
        type="file"
        accept="video/*"
        onChange={(e) => {
          const f = e.target.files[0];
          setFile(f);
          openVideo({ type: "hitter", file: f, setStartFrame, setContactFrame });
        }}
      />
      <button onClick={save}>Save Hitter</button>
    </div>
  );
}

function PitcherForm({ onSave, openVideo }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [contactFrame, setContactFrame] = useState(null);

  const save = () => {
    onSave(name, file, contactFrame);
    setName("");
    setFile(null);
    setContactFrame(null);
  };

  return (
    <div>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "90%" }} />
      <input
        type="file"
        accept="video/*"
        onChange={(e) => {
          const f = e.target.files[0];
          setFile(f);
          openVideo({ type: "pitcher", file: f, setContactFrame });
        }}
      />
      <button onClick={save}>Save Pitcher</button>
    </div>
  );
}

function VideoTagger({ type, file, setStartFrame, setContactFrame }) {
  const videoRef = useRef(null);
  const fps = 30;

  return (
    <div>
      <video
        ref={videoRef}
        src={URL.createObjectURL(file)}
        style={{ width: "100%", maxHeight: "70vh", objectFit: "contain" }}
        controls
      />
      <div>
        <button onClick={() => videoRef.current && (videoRef.current.currentTime -= 1 / fps)}>⏮ Prev Frame</button>
        <button onClick={() => videoRef.current && (videoRef.current.currentTime += 1 / fps)}>Next Frame ⏭</button>
        {type === "hitter" && (
          <>
            <button
              onClick={() => {
                const frame = Math.round(videoRef.current.currentTime * fps);
                setStartFrame(frame);
                alert(`Tagged START frame at ${frame}`);
              }}
            >
              Tag Start
            </button>
            <button
              onClick={() => {
                const frame = Math.round(videoRef.current.currentTime * fps);
                setContactFrame(frame);
                alert(`Tagged CONTACT frame at ${frame}`);
              }}
            >
              Tag Contact
            </button>
          </>
        )}
        {type === "pitcher" && (
          <button
            onClick={() => {
              const frame = Math.round(videoRef.current.currentTime * fps);
              setContactFrame(frame);
              alert(`Tagged CONTACT frame at ${frame}`);
            }}
          >
            Tag Contact
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
