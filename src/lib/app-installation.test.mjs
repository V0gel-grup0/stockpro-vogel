import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nativeRequire = createRequire(import.meta.url);
function compile(path, overrides = {}) {
  const source = readFileSync(new URL("../../" + path, import.meta.url), "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
  assert.equal(result.diagnostics?.length || 0, 0);
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputText)((name) => name in overrides ? overrides[name] : nativeRequire(name), module, module.exports);
  return module.exports;
}

test("manifesto instala o StockPro com abertura própria, ícones corretos e escopo do site", () => {
  const manifest = compile("app/manifest.ts").default();
  assert.equal(manifest.name, "StockPro Vogel");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/abrir");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(manifest.icons.filter((icon) => icon.purpose === "any").map((icon) => icon.sizes), ["192x192", "512x512"]);
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("ícones PNG usam a logo original, geram todas as dimensões e rejeitam tamanho arbitrário", async () => {
  const { GET } = compile("app/api/app-icon/route.tsx");
  const requests = [48, 180, 192, 512];
  for (const size of requests) {
    const response = await GET(new Request(`https://example.test/api/app-icon?size=${size}`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /image\/png/);
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.equal((await GET(new Request("https://example.test/api/app-icon?size=10000"))).status, 400);
  const source = readFileSync(new URL("../../app/api/app-icon/route.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('"public", "logo-vogel.png"'));
  const config = readFileSync(new URL("../../next.config.mjs", import.meta.url), "utf8");
  assert.ok(config.includes('"/api/app-icon": ["./public/logo-vogel.png"]'));
});

test("apresentação mostra Grupo Vogel, permite pular e redireciona ao login após a abertura", () => {
  const effects = []; const transitions = []; let cleanupCalled = false; let timer;
  const previousWindow = global.window;
  global.window = { matchMedia: () => ({ matches: false }), setTimeout: (fn, delay) => { timer = { fn, delay }; return 7; }, clearTimeout: (id) => { assert.equal(id, 7); cleanupCalled = true; } };
  try {
    const Opening = compile("src/components/AppOpening.tsx", { react: { ...React, useEffect: (fn) => effects.push(fn) }, "next/navigation": { useRouter: () => ({ replace: (path) => transitions.push(path) }) } }).default;
    const html = renderToStaticMarkup(React.createElement(Opening));
    assert.ok(html.includes('src="/logo-vogel.png"'));
    assert.ok(html.includes("StockPro"));
    assert.ok(html.includes('href="/login"'));
    assert.ok(html.includes("Entrar agora"));
    const cleanup = effects[0]();
    assert.equal(timer.delay, 2200);
    assert.equal(transitions.length, 0);
    timer.fn(); assert.deepEqual(transitions, ["/login"]);
    cleanup(); assert.equal(cleanupCalled, true);
  } finally { global.window = previousWindow; }
});

test("instalação respeita modo standalone e só chama o instalador após gesto do usuário", async () => {
  const effects = []; const states = []; const listeners = new Map(); const refs = [];
  let index = 0; let opened = 0; let prompts = 0; let installed = false;
  const previousWindow = global.window;
  global.window = { matchMedia: () => ({ matches: installed, addEventListener: () => {}, removeEventListener: () => {} }), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const mock = { ...React, useEffect: (fn) => effects.push(fn), useRef: () => { const ref = { current: { showModal: () => opened++, close: () => {} } }; refs.push(ref); return ref; }, useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = value; }]; } };
  try {
    const Installation = compile("src/components/AppInstallation.tsx", { react: mock }).default;
    const render = () => { index = 0; return Installation(); };
    assert.equal(render(), null);
    const cleanup = effects[0]();
    const find = (type, predicate) => {
      const found = []; function walk(node) { if (!React.isValidElement(node)) return; if (node.type === type && predicate(node)) found.push(node); React.Children.forEach(node.props.children, walk); } walk(render()); return found[0];
    };
    const html = renderToStaticMarkup(render());
    assert.ok(html.includes("Adicionar"));
    assert.ok(html.includes("mesmo login e senha"));
    find("button", (node) => node.props["aria-controls"] === "stockpro-installation").props.onClick();
    assert.equal(opened, 1);
    let prevented = false;
    listeners.get("beforeinstallprompt")({ preventDefault: () => prevented = true, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    assert.equal(prevented, true); assert.equal(prompts, 0);
    await find("button", (node) => node.props.children === "Instalar neste aparelho").props.onClick();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(prompts, 1);
    assert.equal(render(), null);
    cleanup(); assert.equal(listeners.size, 0);
  } finally { global.window = previousWindow; }
});
