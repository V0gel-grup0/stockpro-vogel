import type { Metadata, Viewport } from "next";
import AppInstallation from "@/components/AppInstallation";
import CrmAdminFiltersEnhancer from "@/components/CrmAdminFiltersEnhancer";
import CrmOtherTasksEnhancer from "@/components/CrmOtherTasksEnhancer";
import CrmOtherClientSelectionGuard from "@/components/CrmOtherClientSelectionGuard";
import CrmOtherSaveGuard from "@/components/CrmOtherSaveGuard";
import CrmImportanceEnhancer from "@/components/CrmImportanceEnhancer";
import CrmFunnelQuickEditEnhancer from "@/components/CrmFunnelQuickEditEnhancer";
import CrmFunnelTopScrollbar from "@/components/CrmFunnelTopScrollbar";
import CrmOtherTaskQuickEditEnhancer from "@/components/CrmOtherTaskQuickEditEnhancer";
import InstallationForecastEnhancer from "@/components/InstallationForecastEnhancer";
import ClientCreatorFilterEnhancer from "@/components/ClientCreatorFilterEnhancer";
import AssemblySubmitGuard from "@/components/AssemblySubmitGuard";
import "./globals.css";
import "./field-fixes.css";
import "./mobile.css";
import "./mobile-menu.css";
import "./app-mobile.css";
import "./app-installation.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1324",
};

export const metadata: Metadata = {
  title: "StockPro Vogel",
  description: "Sistema de controle de estoque do Grupo Vogel",
  manifest: "/manifest.webmanifest",
  applicationName: "StockPro Vogel",
  appleWebApp: { capable: true, title: "StockPro Vogel", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/api/app-icon?size=48", type: "image/png", sizes: "48x48" }],
    apple: [{ url: "/api/app-icon?size=180", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <AppInstallation />
        <CrmAdminFiltersEnhancer />
        <CrmOtherTasksEnhancer />
        <CrmOtherClientSelectionGuard />
        <CrmOtherSaveGuard />
        <CrmImportanceEnhancer />
        <CrmFunnelQuickEditEnhancer />
        <CrmFunnelTopScrollbar />
        <CrmOtherTaskQuickEditEnhancer />
        <InstallationForecastEnhancer />
        <ClientCreatorFilterEnhancer />
        <AssemblySubmitGuard />
      </body>
    </html>
  );
}

