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
  const accentLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="591" height="591" viewBox="0 0 591 591"><defs><filter id="accent" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.145098 0 0 0 0 0.388235 0 0 0 0 0.921569 -0.23386 -0.78672 -0.07942 0 1.1"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><image width="591" height="591" href="data:image/png;base64,${logo.toString("base64")}" filter="url(#accent)"/></svg>`;
  const inset = params.get("maskable") === "1" ? 0.70 : 0.94;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <img alt="Grupo Vogel" src={`data:image/svg+xml;base64,${Buffer.from(accentLogo).toString("base64")}`} width={size * inset} height={size * inset} />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } },
  );
}
