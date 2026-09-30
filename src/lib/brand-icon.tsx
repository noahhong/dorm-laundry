import { ImageResponse } from "next/og";

/** App icon: a washer door on the accent color. Rendered by next/og, so only flexbox + basic CSS. */
export function brandIconResponse(size: number, { maskable = false } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.12; // maskable icons need a safe zone
  const door = size - pad * 2;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2e5bff",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div
          style={{
            width: door,
            height: door,
            borderRadius: door,
            border: `${Math.max(2, size * 0.07)}px solid #ffffff`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: door * 0.42,
              height: door * 0.42,
              borderRadius: door,
              background: "#6ce9a6",
              display: "flex",
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
