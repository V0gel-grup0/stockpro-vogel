import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function somenteNumeros(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function pegarChaveNfe(texto: string) {
  const numeros = somenteNumeros(texto);
  const match = numeros.match(/\d{44}/);
  return match?.[0] || "";
}

function pegarCnpj(texto: string) {
  const match = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  return match ? somenteNumeros(match[0]) : "";
}

function pegarNumeroNf(texto: string) {
  const patterns = [
    /NF-e\s*N[ºo°]?\s*\.?\s*(\d{1,12})/i,
    /N[ºo°]?\s*\.?\s*(\d{1,12})/i,
    /NÚMERO\s*(\d{1,12})/i,
    /NUMERO\s*(\d{1,12})/i,
  ];

  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function pegarFornecedor(texto: string) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const indiceEmitente = linhas.findIndex((l) => /IDENTIFICAÇÃO DO EMITENTE|IDENTIFICACAO DO EMITENTE|EMITENTE/i.test(l));

  if (indiceEmitente >= 0) {
    for (let i = indiceEmitente + 1; i < Math.min(indiceEmitente + 8, linhas.length); i++) {
      const linha = linhas[i];
      if (linha.length > 4 && !/DANFE|DOCUMENTO AUXILIAR|NOTA FISCAL|NF-E|CHAVE|CNPJ|INSCRIÇÃO|INSCRICAO/i.test(linha)) {
        return linha;
      }
    }
  }

  const recebemos = texto.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
  if (recebemos?.[1]) return recebemos[1].trim();

  return "";
}

function pegarTelefone(texto: string) {
  const match = texto.match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
  return match ? somenteNumeros(match[0]) : "";
}

function pegarEmail(texto: string) {
  const match = texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || "";
}

function pegarProduto(texto: string) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const indiceProdutos = linhas.findIndex((l) => /DESCRIÇÃO DOS PRODUTOS|DESCRICAO DOS PRODUTOS|DADOS DO PRODUTO|PRODUTO\/SERVIÇO|PRODUTO\/SERVICO/i.test(l));

  if (indiceProdutos >= 0) {
    for (let i = indiceProdutos + 1; i < Math.min(indiceProdutos + 25, linhas.length); i++) {
      const linha = linhas[i];
      if (linha.length > 8 && !/CÓDIGO|CODIGO|DESCRIÇÃO|DESCRICAO|NCM|CFOP|UNID|QUANT|VALOR|BC ICMS|ALÍQ/i.test(linha)) {
        return linha.replace(/\s{2,}/g, " ").slice(0, 120);
      }
    }
  }

  return "";
}

function pegarQuantidade(texto: string) {
  const match = texto.match(/(?:QTD|QUANTIDADE|QUANT)\s*[:\-]?\s*(\d+[,.]?\d*)/i);
  if (match?.[1]) return match[1].replace(",", ".");
  const linhaProduto = texto.match(/\s(\d+[,.]\d{2,4})\s+(?:UN|PC|PÇ|KG|M|CX)\s/i);
  if (linhaProduto?.[1]) return linhaProduto[1].replace(",", ".");
  return "";
}

function pegarValorUnitario(texto: string) {
  const match = texto.match(/VALOR\s+UNIT[ÁA]RIO\s*[:\-]?\s*(\d+[,.]\d{2,6})/i);
  if (match?.[1]) return match[1].replace(",", ".");
  return "";
}

function pegarValorTotal(texto: string) {
  const patterns = [
    /VALOR TOTAL DA NOTA\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /VALOR TOTAL DOS PRODUTOS\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    /TOTAL DA NOTA\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match?.[1]) return match[1].replace(/\./g, "").replace(",", ".");
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Envie um PDF válido." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "O arquivo precisa ser PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const parsed = await pdfParse(buffer);
    const texto = parsed.text || "";

    if (!texto.trim()) {
      return NextResponse.json({ error: "Não consegui ler texto neste PDF. Ele pode ser imagem/escaneado e precisaria de OCR." }, { status: 400 });
    }

    const quantidade = pegarQuantidade(texto);
    const valorTotal = pegarValorTotal(texto);
    const valorUnitarioExtraido = pegarValorUnitario(texto);
    const valorUnitario = valorUnitarioExtraido || (quantidade && valorTotal ? String(Number(valorTotal) / Number(quantidade)) : "");

    return NextResponse.json({
      nf: {
        chave: pegarChaveNfe(texto),
        numero: pegarNumeroNf(texto),
        fornecedor: {
          nome: pegarFornecedor(texto),
          cnpj: pegarCnpj(texto),
          telefone: pegarTelefone(texto),
          email: pegarEmail(texto),
        },
        item: {
          nome: pegarProduto(texto),
          quantidade,
          valor_unitario: valorUnitario,
          valor_total: valorTotal,
        },
        pdf_name: file.name,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro ao ler PDF da NF." }, { status: 500 });
  }
}
