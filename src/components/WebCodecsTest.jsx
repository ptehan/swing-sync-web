import React from "react";

export default function WebCodecsTest() {
  async function runTest() {
    const width = 640;
    const height = 360;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const chunks = [];

    const encoder = new VideoEncoder({
      output: (chunk) => chunks.push(chunk),
      error: (e) => console.error("Encoder error:", e),
    });

    const codec = "vp8"; // ✅ always available in Chrome (software)
    encoder.configure({
      codec,
      width,
      height,
      bitrate: 1_000_000,
      framerate: 30,
    });

    console.log("Encoding using", codec);

    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "lime";
      ctx.fillRect((i * 7) % width, 100, 80, 80);

      const frame = new VideoFrame(canvas, { timestamp: i * (1e6 / 30) });
      encoder.encode(frame);
      frame.close();
      await new Promise((r) => setTimeout(r, 5));
    }

    await encoder.flush();
    encoder.close();

    if (!chunks.length) {
      alert("Encoder produced no chunks.");
      return;
    }

    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "test_vp8.webm";
    a.click();
    URL.revokeObjectURL(url);

    console.log("✅ Done. Frames:", chunks.length, "File size:", blob.size);
  }

  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", marginBottom: "1rem" }}>
      <h3>WebCodecs Smoke Test (VP8)</h3>
      <button onClick={runTest}>Run VP8 Test Encode</button>
    </div>
  );
}
