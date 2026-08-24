import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import {
  PRODUCT_DELETE_ROLES,
  PRODUCT_READ_ROLES,
  PRODUCT_WRITE_ROLES,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductData = {
  name?: string;
  sku?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  cost_price?: number;
  sale_price?: number;
  quantity?: number;
  min_stock?: number;
  supplier_id?: string | null;
};

function normalizeProductData(
  body: Record<string, unknown>,
  partial = false
): { data?: ProductData; error?: string } {
  const data: ProductData = {};
  const stringFields = [
    "name",
    "sku",
    "category",
    "subcategory",
    "description",
  ] as const;
  const stringLimits = {
    name: 200,
    sku: 100,
    category: 100,
    subcategory: 100,
    description: 5000,
  } as const;

  for (const field of stringFields) {
    if (!partial || field in body) {
      const value = typeof body[field] === "string" ? body[field].trim() : "";
      if (value.length > stringLimits[field]) {
        return { error: `${field} excede o limite de ${stringLimits[field]} caracteres.` };
      }
      data[field] = value;
    }
  }

  const decimalFields = ["cost_price", "sale_price"] as const;
  for (const field of decimalFields) {
    if (!partial || field in body) {
      const value = Number(body[field] ?? 0);
      if (!Number.isFinite(value) || value < 0) {
        return { error: `${field} deve ser um número maior ou igual a zero.` };
      }
      data[field] = value;
    }
  }

  const integerFields = ["quantity", "min_stock"] as const;
  for (const field of integerFields) {
    if (!partial || field in body) {
      const value = Number(body[field] ?? 0);
      if (!Number.isInteger(value) || value < 0) {
        return { error: `${field} deve ser um inteiro maior ou igual a zero.` };
      }
      data[field] = value;
    }
  }

  if (!partial || "supplier_id" in body) {
    const supplierId =
      typeof body.supplier_id === "string" ? body.supplier_id.trim() : "";
    if (supplierId && !uuidPattern.test(supplierId)) {
      return { error: "supplier_id deve ser um UUID válido." };
    }
    data.supplier_id = supplierId || null;
  }

  return { data };
}

export async function GET() {
  try {
    const authorization = await authorizeApi(PRODUCT_READ_ROLES);
    if ("response" in authorization) return authorization.response;

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
    const authorization = await authorizeApi(PRODUCT_WRITE_ROLES);
    if ("response" in authorization) return authorization.response;

    const body = (await req.json()) as Record<string, unknown>;
    const normalized = normalizeProductData(body);
    if (normalized.error || !normalized.data?.name) {
      return NextResponse.json(
        { sucesso: false, erro: normalized.error || "O nome é obrigatório." },
        { status: 400 }
      );
    }

    const product = await prisma.products.create({
      data: {
        ...normalized.data,
        name: normalized.data.name as string,
      },
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
    const authorization = await authorizeApi(PRODUCT_WRITE_ROLES);
    if ("response" in authorization) return authorization.response;

    const body = (await req.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { sucesso: false, erro: "ID é obrigatório." },
        { status: 400 }
      );
    }

    const normalized = normalizeProductData(body, true);
    if (normalized.error || !normalized.data || Object.keys(normalized.data).length === 0) {
      return NextResponse.json(
        { sucesso: false, erro: normalized.error || "Nenhum campo válido foi informado." },
        { status: 400 }
      );
    }

    const product = await prisma.products.update({
      where: { id },
      data: normalized.data,
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
    const authorization = await authorizeApi(PRODUCT_DELETE_ROLES);
    if ("response" in authorization) return authorization.response;

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
    const authorization = await authorizeApi(["administrador", "gerente"]);
    if ("response" in authorization) return authorization.response;

    const body = await req.json();
    const produtos = Array.isArray(body?.produtos) ? body.produtos : [];

    if (!produtos.length) {
      return NextResponse.json(
        { sucesso: false, erro: "Nenhum produto informado." },
        { status: 400 }
      );
    }

    for (const produto of produtos) {
      if (!produto || typeof produto !== "object" || Array.isArray(produto)) {
        return NextResponse.json(
          { sucesso: false, erro: "Existe um produto inválido na lista." },
          { status: 400 }
        );
      }
      const normalized = normalizeProductData(produto as Record<string, unknown>);
      const sku =
        typeof normalized.data?.sku === "string" ? normalized.data.sku : "";
      if (normalized.error || !normalized.data?.name || !sku) {
        return NextResponse.json(
          { sucesso: false, erro: normalized.error || "Nome e SKU são obrigatórios." },
          { status: 400 }
        );
      }
      const productData = {
        ...normalized.data,
        name: normalized.data.name as string,
        sku,
      };
      await prisma.products.upsert({
        where: { sku },
        update: productData,
        create: productData,
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
