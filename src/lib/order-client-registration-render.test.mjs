import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Exercise the real shared form without importing the unrelated app modules.
const source = readFileSync(new URL("../components/StockProApp.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("StockProApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["Pessoas", "Field", "SelectField", "TextArea", "Title", "Message", "textMatch"]);
const declarations = ast.statements.filter((statement) => ts.isFunctionDeclaration(statement) && names.has(statement.name?.text)).map((statement) => statement.getText(ast));
const code = 'const { useEffect, useRef, useState } = require("react"); const PROPOSTA_STATUS = ["Lead Frio"];\n' + declarations.join("\n") + "\nmodule.exports.Form = Pessoas;";
const output = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = { exports: {} };
new Function("require", "module", "exports", output)(createRequire(import.meta.url), compiled, compiled.exports);
const props = { title: "Clientes", table: "clients", kind: "cliente", search: "", profile: { id: "autor", role: "vendedor" } };

test("cadastro dentro do pedido mantém os campos e oculta a listagem de clientes", () => {
  const html = renderToStaticMarkup(React.createElement(compiled.exports.Form, { ...props, onCreated: () => {}, onCancel: () => {} }));
  for (const label of ["Cadastrar cliente para o pedido", "Nome", "CPF ou CNPJ", "Telefone", "CEP", "Cidade", "Rua", "Número", "Bairro", "Salvar cliente", "Cancelar"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("Cadastros lançados"));
  assert.ok(!html.includes('class="page-title"'));
});
test("tela normal de Clientes continua mostrando título, cadastro e listagem", () => {
  const html = renderToStaticMarkup(React.createElement(compiled.exports.Form, props));
  assert.ok(html.includes('class="page-title"'));
  assert.ok(html.includes("Novo cadastro"));
  assert.ok(html.includes("Cadastros lançados"));
});
