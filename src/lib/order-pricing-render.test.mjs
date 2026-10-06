import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateOrderValues } from "./order-pricing.ts";

const source = readFileSync(new URL("../components/StockProApp.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("StockProApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["Pedidos", "Field", "SelectField", "TextArea", "Title", "Message", "textMatch", "money", "StatCard", "getSaleCode"]);
const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map((node) => node.getText(ast)).join("\n");
const output = ts.transpileModule('const { useEffect, useMemo, useRef, useState } = require("react");\n' + declarations + "\nmodule.exports.Form = Pedidos;", { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function render(selected) {
  let index = 0;
  const module = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  const mockReact = { ...React, useState(initial) {
    const current = index++;
    if (current === 0) return [true, () => {}];
    if (current === 1) return [{ ...initial, quantity: "3", unit_price: "100", shipping_value: "10", item_type: selected.length ? "equipamento" : "produto" }, () => {}];
    if (current === 2) return [selected, () => {}];
    return [initial, () => {}];
  } };
  new Function("require", "module", "exports", "calculateOrderValues", "EQUIPAMENTOS", "canEditOrder", "canUpdateOrderStatus", "canDeleteOrder", output)((name) => name === "react" ? mockReact : nativeRequire(name), module, module.exports, calculateOrderValues, ["CeltPlus - 220V", "CeltPlus - 380V"], () => true, () => true, () => true);
  return renderToStaticMarkup(React.createElement(module.exports.Form, { profile: { id: "seller-a", role: "vendedor" }, search: "" }));
}
test("formulário real mostra unitário, subtotal automático e total com frete", () => {
  const html = render([]);
  for (const text of ["Valor unitário (R$)", "Subtotal do item (R$)", "Frete por pedido (R$)", "Total do pedido com frete", "+ Cadastrar cliente"]) assert.ok(html.includes(text), text);
  assert.match(html, /id="order-subtotal"[^>]*readOnly/);
  assert.match(html, /310,00/);
});
test("selecionar vários modelos soma o total de todos os pedidos", () => {
  const html = render(["CeltPlus - 220V", "CeltPlus - 380V"]);
  assert.ok(html.includes("Total dos pedidos com frete"));
  assert.match(html, /620,00/);
  assert.ok(html.includes("quantidade, o valor unitário e o frete informados em cada um"));
});
