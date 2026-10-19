import test from "node:test";
import assert from "node:assert/strict";
import { validarCadastroPessoa } from "./validacao-cadastro.ts";

const cadastro = { name: "Matheus Meert", document: "", phone: "45999123456", cep: "", city: "", street: "", number: "", no_number: false, neighborhood: "" };

test("cadastro sem endereço não bloqueia nome e telefone válidos", () => {
  const result = validarCadastroPessoa(cadastro);
  assert.equal(result.valido, true);
  assert.equal(result.dados.city, "");
});

test("aceita endereço rural, parcial e sem CEP sem aplicar validação de texto", () => {
  for (const endereco of [
    { city: "A", street: "Linha 7", number: "s/n", neighborhood: "Interior" },
    { city: "", street: "BR-163 KM 282", number: "", neighborhood: "" },
    { city: "  Marechal   Cândido Rondon ", street: "", cep: "123" },
    { city: "Não informado", street: "Estrada rural", no_number: true, number: "99" },
  ]) {
    const result = validarCadastroPessoa({ ...cadastro, ...endereco });
    assert.equal(result.valido, true, JSON.stringify(endereco));
    assert.equal(result.dados.city, endereco.city.trim().replace(/\s+/g, " "));
    if (endereco.no_number) assert.equal(result.dados.number, "");
  }
});

test("mantém bloqueios de nome e telefone, sem alterar campos já informados", () => {
  assert.equal(validarCadastroPessoa({ ...cadastro, name: "Matheus" }).valido, false);
  assert.equal(validarCadastroPessoa({ ...cadastro, phone: "00000000000" }).valido, false);
  const result = validarCadastroPessoa({ ...cadastro, city: "Toledo", cep: "85900-000", street: "Rua Brasil", number: "123", neighborhood: "Centro" });
  assert.equal(result.valido, true);
  assert.equal(result.dados.cep, "85900000");
  assert.equal(result.dados.street, "Rua Brasil");
});
