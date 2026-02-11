import { ImageResponse } from "next/og";

import { buildPwaIcon } from "@/lib/pwa/icon";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(buildPwaIcon(192), {
    width: 192,
    height: 192
  });
}
