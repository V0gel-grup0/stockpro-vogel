import { NextResponse } from "next/server";

function somenteNumeros(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

export async function POST(request: Request) {
  try {
    const { nf_key } = await request.json();

    const chave = somenteNumeros(nf_key);

    if (!chave) {
      return NextResponse.json(
        { error: "Informe a chave ou número da NF." },
        { status: 400 }
      );
    }

    /*
      Essa rota está pronta para ligar com uma API real de NF-e depois.

      Para puxar dados reais automaticamente, será necessário:
      - XML da NF enviado pelo fornecedor,
      - ou integração com API fiscal,
      - ou integração Conta Azul/SEFAZ com certificado/autorização.

      Por enquanto, ela não inventa dados falsos.
    */

    if (!process.env.NFE_API_URL && !process.env.CONTA_AZUL_CLIENT_ID) {
      return NextResponse.json(
        {
          error:
            "Integração de NF ainda não configurada. Preencha os dados manualmente após informar a NF, ou configure uma API fiscal.",
        },
        { status: 501 }
      );
    }

    return NextResponse.json({
      ok: true,
      nf: {
        chave,
        numero: chave.slice(-9),
        fornecedor: {
          nome: "",
          cnpj: "",
          telefone: "",
          email: "",
        },
        itens: [],
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao consultar NF." },
      { status: 500 }
    );
  }
}