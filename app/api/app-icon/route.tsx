import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const size = Number(params.get("size") || "192");
  if (![48, 180, 192, 512].includes(size)) return new Response("Tamanho inválido.", { status: 400 });
  // The exact same official PNG used by the site; never redraw the brand.
  const logo = await readFile(join(process.cwd(), "public", "logo-vogel.png"));
  const inset = params.get("maskable") === "1" ? 0.70 : 0.94;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      <img alt="Grupo Vogel" src={`data:image/png;base64,${logo.toString("base64")}`} width={size * inset} height={size * inset} />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } },
  );
}
