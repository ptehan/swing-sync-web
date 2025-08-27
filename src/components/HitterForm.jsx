import React from "react";
import { getSwingStats } from "../utils/dataModel.js";

export default function HitterForm({ hitter, onDeleteHitter, onDeleteSwing }) {
  const stats = getSwingStats(hitter);

  return (
    <div style={{ marginBottom: "1rem", padding: "0.5rem", border: "1px solid #ccc" }}>
      <h3>
        {hitter.name}{" "}
        <button onClick={() => onDeleteHitter(hitter.name)}>Delete Hitter</button>
      </h3>

      {stats && (
        <p>
          Swings: {stats.count} | Min: {stats.min.toFixed(2)}s | Max:{" "}
          {stats.max.toFixed(2)}s | Avg: {stats.avg.toFixed(2)}s
        </p>
      )}

      <ul>
        {hitter.swings.map((swing, i) => (
          <li key={i}>
            Swing {i + 1}: {swing.swingTime}s
            <button onClick={() => onDeleteSwing(hitter.name, i)}>Delete Swing</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
