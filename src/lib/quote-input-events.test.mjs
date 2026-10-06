import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EQUIPMENT_CATALOG } from "./equipment-catalog.ts";

const source = readFileSync(new URL("../components/QuotesModule.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nativeRequire = createRequire(import.meta.url);

// Exercise the actual form handlers with state updates queued after the event callback.
// This is a lifecycle regression test, not a substitute for an authenticated browser test.
function harness(extraProps = {}) {
  const states = []; const queue = []; let hook = 0;
  const module = { exports: {} };
  const mockReact = { ...React, useEffect: () => {}, useMemo: (callback) => callback(),
    useState(initial) {
      const index = hook++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (update) => queue.push(() => { states[index] = typeof update === "function" ? update(states[index]) : update; })];
    },
  };
  new Function("require", "module", "exports", output)((name) => {
    if (name === "react") return mockReact;
    if (name === "@/lib/equipment-catalog") return { EQUIPMENT_CATALOG };
    return nativeRequire(name);
  }, module, module.exports);
  const render = () => { hook = 0; return module.exports.default({ profile: { id: "author-a", role: "administrador", name: "Nicole" }, search: "", initialContext: null, onContextConsumed: () => {}, ...extraProps }); };
  render(); states[8] = true; states[14] = false;
  const fields = () => {
    const found = [];
    function walk(node, label = "") {
      if (!React.isValidElement(node)) return;
      if (node.type === "div" && String(node.props.className || "").split(" ").includes("field")) {
        const children = React.Children.toArray(node.props.children);
        const fieldLabel = children.find((child) => React.isValidElement(child) && child.type === "label");
        if (fieldLabel) label = String(fieldLabel.props.children);
      }
      if (["input", "select", "textarea"].includes(node.type)) found.push({ label, element: node });
      React.Children.forEach(node.props.children, (child) => walk(child, label));
    }
    walk(render()); return found;
  };
  function change(label, value, type) {
    const field = fields().find((field) => field.label === label && (!type || field.element.type === type));
    assert.ok(field, `Campo ${label} não encontrado`);
    const event = { target: { value }, currentTarget: { value } };
    field.element.props.onChange(event);
    // Ensure queued updates use the captured string, not the event's mutable target.
    event.target = null; event.currentTarget = null;
    while (queue.length) queue.shift()();
    assert.doesNotThrow(() => renderToStaticMarkup(render()));
  }
  return { states, fields, change, render, flush: () => { while (queue.length) queue.shift()(); } };
}

test("pagamento e observações aceitam digitação quando a atualização é adiada", () => {
  const h = harness();
  for (const text of ["a", "à", "À vista", "50% na aprovação + 50% na entrega"]) h.change("Condição de pagamento", text, "input");
  assert.equal(h.states[6].payment_terms, "50% na aprovação + 50% na entrega");
  h.change("Observações", "Cliente João & Nicole\nEntregar CELT.", "textarea");
  assert.equal(h.states[6].notes, "Cliente João & Nicole\nEntregar CELT.");
});

test("cadastro no orçamento seleciona novo cliente, preserva itens e bloqueia salvar enquanto aberto", () => {
  let callbacks;
  const h = harness({ renderClientRegistration: (value) => { callbacks = value; return React.createElement("p", null, "Cadastro compartilhado"); } });
  const buttons = () => {
    const found = [];
    function walk(node) {
      if (!React.isValidElement(node)) return;
      if (node.type === "button") found.push(node);
      React.Children.forEach(node.props.children, walk);
    }
    walk(h.render()); return found;
  };
  h.states[6].notes = "Preservar observações";
  h.states[6].items[0].quantity = "3";
  const items = h.states[6].items;
  buttons().find((node) => node.props.children === "+ Cadastrar cliente").props.onClick();
  h.flush(); h.render();
  assert.equal(buttons().find((node) => node.props.children === "Salvar orçamento").props.disabled, true);
  callbacks.onCreated({ id: "44444444-4444-4444-8444-444444444444", name: "Cliente novo", document: "12345678901" });
  h.flush();
  assert.equal(h.states[6].client_id, "44444444-4444-4444-8444-444444444444");
  assert.equal(h.states[6].notes, "Preservar observações");
  assert.equal(h.states[6].items, items);
  assert.equal(h.states[9], "");
  assert.equal(buttons().find((node) => node.props.children === "Salvar orçamento").props.disabled, false);
  assert.ok(renderToStaticMarkup(h.render()).includes("Cliente novo"));
});
test("cliente, oportunidade, responsável e validade guardam os valores sem guardar o evento", () => {
  const h = harness();
  h.states[6].opportunity_id = "opportunity-before";
  for (const [label, value, field] of [["Cliente *", "client-a", "client_id"], ["Oportunidade CRM", "opportunity-a", "opportunity_id"], ["Responsável *", "seller-a", "responsible_id"], ["Validade *", "2026-10-30", "valid_until"]]) {
    h.change(label, value);
    assert.equal(h.states[6][field], value);
    if (field === "client_id") assert.equal(h.states[6].opportunity_id, "");
  }
});
test("frete, desconto e itens permanecem editáveis após o evento", () => {
  const h = harness();
  h.change("Frete", "25.50"); h.change("Desconto geral", "10");
  h.change("Tipo", "custom"); h.change("Nome", "Serviço de instalação");
  h.change("Descrição", "Montagem no aviário"); h.change("Quantidade", "2"); h.change("Valor unitário", "100");
  assert.equal(h.states[6].shipping_value, "25.50");
  assert.equal(h.states[6].discount_value, "10");
  assert.equal(h.states[6].items[0].description, "Montagem no aviário");
  assert.equal(h.states[6].items[0].quantity, "2");
});

test("pesquisa de cliente aceita letras, documentos e limpeza sem renderizar cliente interno", () => {
  const h = harness();
  h.states[1] = [
    { id: "11111111-1111-4111-8111-111111111111", name: "João Silva", document: "12345678901" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Empresa Vogel", document: "98765432000100" },
    { id: "33333333-3333-4333-8333-333333333333", name: "__CRM_OUTROS__" },
  ];
  for (const query of ["j", "João", "123456", "Vogel", "987654", "sem resultado", ""]) {
    h.change("Pesquisar cliente", query);
    assert.equal(h.states[9], query);
    const html = renderToStaticMarkup(h.render());
    assert.ok(!html.includes("__CRM_OUTROS__"));
    if (query === "j" || query === "123456") {
      assert.ok(html.includes("João Silva"));
      assert.ok(!html.includes("Empresa Vogel"));
    }
  }
});
