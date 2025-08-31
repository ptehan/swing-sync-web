import React from "react";

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          padding: "1rem",
          background: "#222",
          color: "#fff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h2>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            fontSize: "1.5rem",
          }}
        >
          ✕
        </button>
      </div>
      <div
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          padding: "1rem",
        }}
      >
        {children}
      </div>
    </div>
  );
}
