import { Suspense } from "react";
import CadastrarUsuarioClient from "./CadastrarUsuarioClient";

export const dynamic = "force-dynamic";

export default function CadastrarUsuarioPage() {
  return (
    <Suspense fallback={<LoadingCadastro />}>
      <CadastrarUsuarioClient />
    </Suspense>
  );
}

function LoadingCadastro() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <div
        style={{
          background: "#0f172a",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: 24,
          padding: 32,
          fontWeight: 800,
        }}
      >
        Carregando cadastro...
      </div>
    </main>
  );
}