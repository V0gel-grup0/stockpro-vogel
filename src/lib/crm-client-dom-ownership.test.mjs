import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../components/CrmOtherTasksEnhancer.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("enhancer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "hideInternalOtherClient");
const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

test("complemento do CRM oculta cliente interno sem remover opções que pertencem ao React", () => {
  const internal = { textContent: "__CRM_OUTROS__", remove() { throw new Error("React perderia seu filho DOM"); } };
  const real = { textContent: "João Silva" };
  const options = [internal, real];
  const document = { querySelectorAll(selector) { return selector === "select" ? [{ options }] : []; } };
  new Function("document", "INTERNAL_OTHER_CLIENT", code + "\n hideInternalOtherClient();")(document, "__CRM_OUTROS__");
  assert.equal(options.length, 2);
  assert.equal(internal.hidden, true);
  assert.equal(internal.disabled, true);
  assert.equal(real.hidden, undefined);
  assert.ok(!source.includes("option.remove()"), "nenhum outro caminho pode remover opções do React");
});
