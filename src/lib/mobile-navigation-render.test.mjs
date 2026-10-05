import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as navigation from "./mobile-navigation.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/MobileNavigation.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = { exports: {} };
new Function("require", "module", "exports", output)((id) => id === "@/lib/mobile-navigation" ? navigation : require(id), compiled, compiled.exports);
const Navigation = compiled.exports.default;
const noop = () => {};

test("navegação renderiza os atalhos e um menu inicialmente fechado com diálogo acessível", () => {
  const html = renderToStaticMarkup(React.createElement(Navigation, { menus: ["Dashboard", "CRM", "Pedidos", "Relatórios"], page: "CRM", open: false, onOpen: noop, onClose: noop, onNavigate: noop, name: "Nicole", role: "Vendedora", onLogout: noop }));
  assert.match(html, /aria-label="Navegação principal no celular"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-labelledby="mobile-menu-title"/);
  assert.match(html, /class="active"[^>]*><svg/);
  assert.match(html, />Relatórios<\/span>/);
  assert.doesNotMatch(html, />Colaboradores<\/span>/);
  assert.doesNotMatch(html, /<dialog[^>]* open/);
});
