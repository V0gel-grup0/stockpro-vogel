import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "StockPro Vogel", short_name: "StockPro",
    description: "Estoque, pedidos e CRM do Grupo Vogel.",
    lang: "pt-BR", start_url: "/abrir", scope: "/", display: "standalone",
    background_color: "#0b1324", theme_color: "#0b1324",
    icons: [
      { src: "/api/app-icon?v=3&size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/app-icon?v=3&size=512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
