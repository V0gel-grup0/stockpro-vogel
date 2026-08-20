import assert from "node:assert/strict";
import test from "node:test";
import {
  existeCpfDuplicado,
  validarCpf,
} from "./validacao-cadastro.ts";

function calcularDigito(base) {
  const initialWeight = base.length + 1;
  const sum = base
    .split("")
    .reduce(
      (total, digit, index) =>
        total + Number(digit) * (initialWeight - index),
      0
    );
  const remainder = sum % 11;

  return remainder < 2 ? 0 : 11 - remainder;
}

function gerarCpfDeTeste(base) {
  const firstDigit = calcularDigito(base);
  const secondDigit = calcularDigito(`${base}${firstDigit}`);

  return `${base}${firstDigit}${secondDigit}`;
}

function mascararCpf(cpf) {
  return cpf.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    "$1.$2.$3-$4"
  );
}

test("bloqueia CPFs inválidos, repetidos ou incompletos", () => {
  const invalidValues = [
    "000.000.000-00",
    "111.111.111-11",
    "123.456.789-00",
    "123",
    "texto qualquer",
  ];

  for (const value of invalidValues) {
    assert.equal(validarCpf(value), false, `deveria bloquear: ${value}`);
  }
});

test("aceita CPFs sintéticos matematicamente válidos com e sem máscara", () => {
  const firstSyntheticCpf = gerarCpfDeTeste("123456789");
  const secondSyntheticCpf = gerarCpfDeTeste("987654321");

  assert.equal(validarCpf(firstSyntheticCpf), true);
  assert.equal(validarCpf(mascararCpf(secondSyntheticCpf)), true);
});

test("considera o mesmo CPF com máscara e sem máscara como duplicado", () => {
  const syntheticCpf = gerarCpfDeTeste("123456789");

  assert.equal(
    existeCpfDuplicado(mascararCpf(syntheticCpf), [
      { id: "client-a", document: syntheticCpf },
    ]),
    true
  );
});

test("permite manter o próprio CPF durante a edição", () => {
  const syntheticCpf = gerarCpfDeTeste("987654321");

  assert.equal(
    existeCpfDuplicado(
      syntheticCpf,
      [{ id: "client-a", document: mascararCpf(syntheticCpf) }],
      "client-a"
    ),
    false
  );
});

test("bloqueia CPF pertencente a outro cliente durante a edição", () => {
  const syntheticCpf = gerarCpfDeTeste("123456789");

  assert.equal(
    existeCpfDuplicado(
      syntheticCpf,
      [
        { id: "client-a", document: mascararCpf(syntheticCpf) },
        { id: "client-b", document: gerarCpfDeTeste("987654321") },
      ],
      "client-b"
    ),
    true
  );
});
