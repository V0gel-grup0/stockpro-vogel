export const MAX_MOVEMENT_INVOICE_SIZE = 3_000_000;

export function validateMovementInvoice(name: string, bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_MOVEMENT_INVOICE_SIZE) throw new Error("Selecione uma NF de até 3 MB.");
  const ext = name.toLowerCase().split(".").pop();
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const prefix = new TextDecoder().decode(bytes.subarray(0, 512)).replace(/^\uFEFF/, "").trimStart();
  let mime = "";
  if (ext === "pdf" && starts([37, 80, 68, 70, 45])) mime = "application/pdf";
  if (ext === "xml" && prefix.startsWith("<") && !/^<!doctype\s+html|^<html[\s>]/i.test(prefix)) mime = "application/xml";
  if (["jpg", "jpeg"].includes(ext || "") && starts([255, 216, 255])) mime = "image/jpeg";
  if (ext === "png" && starts([137, 80, 78, 71, 13, 10, 26, 10])) mime = "image/png";
  if (!mime) throw new Error("Envie uma NF em PDF, XML, JPG ou PNG válido.");
  const fileName = name.replace(/[\r\n\x00]/g, "").split(/[\\/]/).pop()?.slice(0, 240) || `nota-fiscal.${ext}`;
  return { fileName, mime, size: bytes.length };
}
