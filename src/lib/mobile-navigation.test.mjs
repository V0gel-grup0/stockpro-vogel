import test from "node:test";
import assert from "node:assert/strict";
import { mobileTabs, mobilePageLabel } from "./mobile-navigation.ts";

test("atalhos móveis usam apenas módulos permitidos e não alteram o menu original", () => {
  const menus = ["Dashboard", "Clientes", "CRM", "Pedidos", "Relatórios", "Meu Perfil"];
  const copy = [...menus];
  assert.deepEqual(mobileTabs(menus), ["Dashboard", "CRM", "Pedidos"]);
  assert.deepEqual(menus, copy);
  assert.deepEqual(mobileTabs(["Dashboard", "CRM", "Montagens", "Componentes", "Meu Perfil"]), ["Dashboard", "CRM", "Montagens"]);
});
test("menus restritos não ganham acesso a módulos extras", () => {
  assert.deepEqual(mobileTabs(["Meu Perfil"]), ["Meu Perfil"]);
  assert.deepEqual(mobileTabs([]), []);
  assert.deepEqual(mobileTabs(["CRM", "Produtos"]), ["CRM", "Produtos"]);
});
test("rótulos móveis são curtos e preservam os demais nomes", () => {
  assert.equal(mobilePageLabel("Dashboard"), "Início");
  assert.equal(mobilePageLabel("Equipamentos Montados"), "Equipamentos");
  assert.equal(mobilePageLabel("Relatórios"), "Relatórios");
});
