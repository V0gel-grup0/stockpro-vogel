import type { Metadata } from "next";
import CrmAdminFiltersEnhancer from "@/components/CrmAdminFiltersEnhancer";
import CrmOtherTasksEnhancer from "@/components/CrmOtherTasksEnhancer";
import CrmOtherClientSelectionGuard from "@/components/CrmOtherClientSelectionGuard";
import CrmOtherSaveGuard from "@/components/CrmOtherSaveGuard";
import CrmImportanceEnhancer from "@/components/CrmImportanceEnhancer";
import CrmFunnelQuickEditEnhancer from "@/components/CrmFunnelQuickEditEnhancer";
import CrmFunnelTopScrollbar from "@/components/CrmFunnelTopScrollbar";
import InstallationForecastEnhancer from "@/components/InstallationForecastEnhancer";
import ClientCreatorFilterEnhancer from "@/components/ClientCreatorFilterEnhancer";
import AssemblySubmitGuard from "@/components/AssemblySubmitGuard";
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
        <CrmOtherTasksEnhancer />
        <CrmOtherClientSelectionGuard />
        <CrmOtherSaveGuard />
        <CrmImportanceEnhancer />
        <CrmFunnelQuickEditEnhancer />
        <CrmFunnelTopScrollbar />
        <InstallationForecastEnhancer />
        <ClientCreatorFilterEnhancer />
        <AssemblySubmitGuard />
      </body>
    </html>
  );
}
