import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const products = await prisma.products.findMany({
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json({
      sucesso: true,
      products,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const product = await prisma.products.create({
      data: body,
    });

    return NextResponse.json(
      {
        sucesso: true,
        product,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, ...dados } = body;

    if (!id) {
      return NextResponse.json(
        { sucesso: false, erro: "ID é obrigatório." },
        { status: 400 }
      );
    }

    const product = await prisma.products.update({
      where: { id },
      data: dados,
    });

    return NextResponse.json({
      sucesso: true,
      product,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { sucesso: false, erro: "ID é obrigatório." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.movements.updateMany({ where: { product_id: id }, data: { product_id: null } });
      await tx.movements.updateMany({ where: { item_type: "produto", item_id: id }, data: { item_id: null } });
      await tx.products.delete({ where: { id } });
    });

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const produtos = Array.isArray(body?.produtos) ? body.produtos : [];

    if (!produtos.length) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhum produto informado." },
        { status: 400 }
      );
    }

    for (const produto of produtos) {
      await prisma.products.upsert({
        where: { sku: produto.sku },
        update: produto,
        create: produto,
      });
    }

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
