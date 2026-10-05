import test from "node:test";
import assert from "node:assert/strict";
import { validateMovementInvoice, MAX_MOVEMENT_INVOICE_SIZE } from "./movement-invoice-policy.ts";

test("aceita PDF, XML e imagens com extensão e assinatura compatíveis", () => {
  assert.equal(validateMovementInvoice("nf.PDF", Buffer.from("%PDF-1.7\n")).mime, "application/pdf");
  assert.equal(validateMovementInvoice("nf.xml", Buffer.from('\uFEFF<?xml version="1.0"?><nfeProc/>')).mime, "application/xml");
  assert.equal(validateMovementInvoice("nf.jpeg", new Uint8Array([255, 216, 255, 224])).mime, "image/jpeg");
  assert.equal(validateMovementInvoice("nf.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])).mime, "image/png");
});
test("rejeita arquivos vazios, acima do limite e formatos disfarçados", () => {
  assert.throws(() => validateMovementInvoice("nf.pdf", new Uint8Array()));
  assert.throws(() => validateMovementInvoice("nf.pdf", new Uint8Array(MAX_MOVEMENT_INVOICE_SIZE + 1)));
  assert.throws(() => validateMovementInvoice("nf.pdf", Buffer.from("<html>falso</html>")));
  assert.throws(() => validateMovementInvoice("nf.exe", Buffer.from("%PDF-1.7")));
  assert.throws(() => validateMovementInvoice("nf.xml", Buffer.from("<!DOCTYPE html><html/>")));
});
test("limite exato é aceito e nome de download remove caminhos e controles", () => {
  const bytes = Buffer.alloc(MAX_MOVEMENT_INVOICE_SIZE); bytes.write("%PDF-1.7");
  assert.equal(validateMovementInvoice("../../nota\r\n.pdf", bytes).fileName, "nota.pdf");
  assert.equal(validateMovementInvoice("nota.pdf", bytes).size, MAX_MOVEMENT_INVOICE_SIZE);
});
