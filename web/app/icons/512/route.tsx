import { ImageResponse } from "next/og";

export function GET() {
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
          fontSize: 240,
          fontWeight: 800,
        }}
      >
        UF
      </div>
    ),
    { width: 512, height: 512 },
  );
}
