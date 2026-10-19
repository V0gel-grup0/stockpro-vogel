import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as policy from "./general-crm-policy.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/GeneralCrm.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(search = "") {
  let hook = 0; const states = []; const queue = [];
  const mockReact = { ...React, useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn(), useRef: () => ({ current: false }), useState(initial) {
    const index = hook++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], (update) => queue.push(() => { states[index] = typeof update === "function" ? update(states[index]) : update; })];
  } };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => name === "react" ? mockReact : name === "@/lib/general-crm-policy" ? policy : require(name), module, module.exports);
  const render = () => { hook = 0; return module.exports.default({ profile: { id: "author", role: "administrador" }, search }); };
  render(); states[2] = false;
  return { states, render, flush() { while (queue.length) queue.shift()(); } };
}
test("CRM geral tem acesso próprio para todos os perfis sem remover CRM anterior", () => {
  const app = readFileSync(new URL("../components/StockProApp.tsx", import.meta.url), "utf8");
  for (const role of policy.GENERAL_CRM_ROLES) assert.match(app, new RegExp(role + ": \\[[^\\n]*\"CRM\", \"CRM geral\""));
  assert.ok(app.includes('page === "CRM geral" && canAccessCrm(profile.role, "internal") && <GeneralCrm'));
  assert.ok(app.includes('canAccessCrm(profile.role, "commercial") ? <CRM'));
});
test("etapas renderizam verticalmente em lista e não possuem os seletores dos complementos comerciais", () => {
  const h = harness(); const html = renderToStaticMarkup(h.render());
  for (const text of ["CRM geral", "+ Nova demanda", "Nova", "Em andamento", "Aguardando", "Concluída", "Cancelada", "Filtrar responsável", "Somente atrasadas"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("grid-template-columns:minmax(0, 1fr)"));
  assert.ok(!html.includes("Funil comercial"));
  assert.ok(!html.includes("crm-opportunity-form"));
});
test("formulário mantém valores quando atualizações do React ocorrem após o evento", () => {
  const h = harness(); h.states[5] = true;
  const elements = (type) => {
    const found = [];
    function walk(node) { if (!React.isValidElement(node)) return; if (node.type === type) found.push(node); React.Children.forEach(node.props.children, walk); }
    walk(h.render()); return found;
  };
  for (const [id, value, key, type] of [["general-demand-title", "Solicitação João", "title", "input"], ["general-demand-description", "Linha 1\nLinha 2", "description", "textarea"], ["general-demand-stage", "waiting", "status", "select"], ["general-demand-priority", "urgent", "priority", "select"], ["general-demand-due", "2026-10-21T13:00", "due_at", "input"]]) {
    const element = elements(type).find((item) => item.props.id === id); assert.ok(element);
    const event = { currentTarget: { value }, target: { value } }; element.props.onChange(event); event.currentTarget = null; event.target = null; h.flush();
    assert.equal(h.states[7][key], value);
    assert.doesNotThrow(() => renderToStaticMarkup(h.render()));
  }
});
test("busca filtra demandas, exibe observações com escape e não mistura grupos", () => {
  const h = harness("entrega");
  h.states[0] = [{ id: "a", title: "Entrega urgente", description: "<script>alert(1)</script>", status: "new", priority: "urgent", due_at: "2020-01-01", assigned_to: "author", created_by: "author" }, { id: "b", title: "Comprar peças", status: "waiting", priority: "normal", description: "" }];
  const html = renderToStaticMarkup(h.render());
  assert.ok(html.includes("Entrega urgente"));
  assert.ok(!html.includes("Comprar peças"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Atrasada"));
});
