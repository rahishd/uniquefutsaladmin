import { ImageResponse } from "next/og";

// Icon used when the portal is added to an iPhone/iPad home screen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c0b5d",
          color: "#ffffff",
          fontSize: 80,
          fontWeight: 800,
        }}
      >
        UF
      </div>
    ),
    size,
  );
}
