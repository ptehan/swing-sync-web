import React from "react";

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <h3 style={{ fontSize: "14px", margin: "5px 0" }}>{title}</h3>
      {children}
    </div>
  );
}

export default Section;
