import type { ReactElement } from "react";

export function buildPwaIcon(dimension: number): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        color: "#ffffff",
        background:
          "radial-gradient(circle at 12% 12%, rgba(37, 66, 143, 0.9), transparent 42%), linear-gradient(135deg, #0f7d6f 0%, #0a6056 100%)",
        borderRadius: Math.max(24, Math.floor(dimension * 0.18))
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: Math.floor(dimension * 0.12),
          borderRadius: Math.max(16, Math.floor(dimension * 0.14)),
          border: `${Math.max(4, Math.floor(dimension * 0.03))}px solid rgba(255,255,255,0.26)`
        }}
      />
      <span
        style={{
          fontSize: Math.max(44, Math.floor(dimension * 0.42)),
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          textShadow: "0 8px 22px rgba(0,0,0,0.24)"
        }}
      >
        £
      </span>
    </div>
  );
}
