import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isLowStockProduct } from "./dashboard-navigation.ts";

const source = readFileSync(new URL("../components/StockProApp.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("StockProApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Set(["Dashboard", "StatCard", "Title", "formatRole"]);
const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && functions.has(node.name?.text) || ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(ast) === "menuByRole")).map((node) => node.getText(ast)).join("\n");
const module = { exports: {} };
const code = 'const { useState, useEffect } = require("react");\n' + declarations + "\nmodule.exports={Dashboard,StatCard,menuByRole};";
const transpile = (value) => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nativeRequire = createRequire(import.meta.url);
new Function("require", "module", "exports", transpile(code))((name) => name === "react" ? { ...React, useState: (initial) => [initial, () => {}], useEffect: () => {} } : nativeRequire(name), module, module.exports);
const { Dashboard, StatCard, menuByRole } = module.exports;
function cards(role) {
  const calls = [];
  const root = Dashboard({ profile: { role, name: "Nicole" }, onNavigate: (...args) => calls.push(args) });
  const result = [];
  function walk(node) { if (!React.isValidElement(node)) return; if (node.type === StatCard) result.push(node.props); React.Children.forEach(node.props.children, walk); }
  walk(root);
  return { result, calls };
}
test("indicadores do administrador abrem suas seis páginas de destino", () => {
  const { result, calls } = cards("administrador");
  assert.equal(result.length, 6);
  result.forEach((card) => card.onClick());
  assert.deepEqual(calls.map(([page]) => page), ["Produtos", "Clientes", "Pedidos", "Análise de Cadastros", "Produtos", "Meu Perfil"]);
  assert.equal(calls[4][1].lowStockOnly, true);
  assert.equal(calls[0][1].lowStockOnly, false);
});
test("indicadores sem permissão permanecem informativos em todos os perfis", () => {
  for (const role of Object.keys(menuByRole)) {
    const { result } = cards(role);
    for (const card of result) assert.equal(Boolean(card.onClick), menuByRole[role].includes(card.destination), `${role}: ${card.label}`);
  }
});
test("card clicável é um botão de teclado com nome acessível; os demais continuam div", () => {
  const html = renderToStaticMarkup(React.createElement(StatCard, { label: "Pedidos", value: "3", destination: "Pedidos", onClick: () => {} }));
  assert.match(html, /<button type="button"/);
  assert.ok(html.includes('aria-label="Pedidos: 3. Abrir Pedidos"'));
  assert.ok(html.includes("Abrir Pedidos"));
  const passive = renderToStaticMarkup(React.createElement(StatCard, { label: "Total", value: "0" }));
  assert.ok(passive.startsWith('<div class="stat-card"'));
  assert.ok(!passive.includes("button"));
});
test("estoque baixo usa o mesmo limite do indicador e inclui estoque zero", () => {
  assert.equal(isLowStockProduct({ quantity: 0, min_stock: 0 }), true);
  assert.equal(isLowStockProduct({ quantity: "5", min_stock: "5" }), true);
  assert.equal(isLowStockProduct({ quantity: 4, min_stock: 5 }), true);
  assert.equal(isLowStockProduct({ quantity: 6, min_stock: 5 }), false);
});

let navSource;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "navigateToPage") navSource = node.getText(ast); ts.forEachChild(node, visit); }
visit(ast);
function navigation(role) {
  const changes = {};
  const deps = { profile: { role }, menuByRole,
    window: { requestAnimationFrame: (callback) => callback(), scrollTo: () => {} },
    mainRef: { current: { focus: () => {} } },
  };
  for (const name of ["setPage", "setProductsLowStockOnly", "setMobileMenuOpen", "setNotificationsOpen", "setSearch", "setMobileSearchOpen"]) deps[name] = (value) => { changes[name] = value; };
  const module = { exports: {} };
  new Function("module", ...Object.keys(deps), transpile(navSource + "\nmodule.exports.navigate=navigateToPage;"))(module, ...Object.values(deps));
  return { changes, navigate: module.exports.navigate };
}
test("navegação real aplica filtro, limpa busca e fecha menus", () => {
  const f = navigation("administrador");
  f.navigate("Produtos", { lowStockOnly: true });
  assert.equal(f.changes.setPage, "Produtos");
  assert.equal(f.changes.setProductsLowStockOnly, true);
  assert.equal(f.changes.setSearch, "");
  assert.equal(f.changes.setMobileMenuOpen, false);
  f.navigate("Produtos");
  assert.equal(f.changes.setProductsLowStockOnly, false);
});
test("navegação real bloqueia páginas fora das permissões", () => {
  const f = navigation("representante"); f.navigate("Análise de Cadastros");
  assert.deepEqual(f.changes, {});
});
