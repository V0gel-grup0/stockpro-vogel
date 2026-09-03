import type { Metadata } from "next";
import CrmAdminFiltersEnhancer from "@/components/CrmAdminFiltersEnhancer";
import InstallationForecastEnhancer from "@/components/InstallationForecastEnhancer";
import "./globals.css";
import "./field-fixes.css";
import "./mobile.css";
import "./mobile-menu.css";

export const metadata: Metadata = {
  title: "StockPro Vogel",
  description: "Sistema de controle de estoque do Grupo Vogel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <CrmAdminFiltersEnhancer />
        <InstallationForecastEnhancer />
      </body>
    </html>
  );
}
