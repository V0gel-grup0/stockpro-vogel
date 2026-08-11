import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupplierData = {
  name?: string;
  document?: string;
  phone?: string;
  email?: string;
  cep?: string;
  city?: string;
  street?: string;
  number?: string;
  no_number?: boolean;
  neighborhood?: string;
  products?: string[];
};

function normalizeString(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeSupplierData(
  body: Record<string, unknown>,
  partial = false
): SupplierData {
  const data: SupplierData = {};

  const stringFields = [
    "name",
    "document",
    "phone",
    "email",
    "cep",
    "city",
    "street",
    "number",
    "neighborhood",
  ] as const;

  for (const field of stringFields) {
    if (!partial || field in body) {
      data[field] = normalizeString(body[field]);
    }
  }

  if (!partial || "no_number" in body) {
    data.no_number = Boolean(body.no_number);
  }

  if (!partial || "products" in body) {
    data.products = Array.isArray(body.products)
      ? body.products
          .filter(
            (item): item is string =>
              typeof item === "string"
          )
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  }

  return data;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const document = searchParams.get("document");

    if (document !== null) {
      const supplier =
        await prisma.suppliers.findFirst({
          where: {
            document: document.trim(),
          },
        });

      return NextResponse.json({
        sucesso: true,
        supplier,
      });
    }

    const suppliers =
      await prisma.suppliers.findMany({
        orderBy: {
          name: "asc",
        },
      });

    return NextResponse.json({
      sucesso: true,
      suppliers,
    });
  } catch (error) {
    console.error(
      "Erro ao carregar fornecedores:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao carregar fornecedores.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const data = normalizeSupplierData(body);

    if (!data.name) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "O nome do fornecedor é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    if (data.document) {
      const existing =
        await prisma.suppliers.findFirst({
          where: {
            document: data.document,
          },
          select: {
            id: true,
          },
        });

      if (existing) {
        return NextResponse.json(
          {
            sucesso: false,
            erro:
              "Já existe um fornecedor com este CPF ou CNPJ.",
          },
          {
            status: 409,
          }
        );
      }
    }

    const supplier =
      await prisma.suppliers.create({
        data: {
          name: data.name,
          document: data.document || "",
          phone: data.phone || "",
          email: data.email || "",
          cep: data.cep || "",
          city: data.city || "",
          street: data.street || "",
          number: data.number || "",
          no_number: data.no_number || false,
          neighborhood:
            data.neighborhood || "",
          products: data.products || [],
        },
      });

    return NextResponse.json(
      {
        sucesso: true,
        supplier,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Erro ao criar fornecedor:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao criar fornecedor.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const id = normalizeString(body.id);

    if (!id) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    const data = normalizeSupplierData(
      body,
      true
    );

    if ("name" in data && !data.name) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "O nome do fornecedor é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    if (data.document) {
      const duplicate =
        await prisma.suppliers.findFirst({
          where: {
            document: data.document,
            NOT: {
              id,
            },
          },
          select: {
            id: true,
          },
        });

      if (duplicate) {
        return NextResponse.json(
          {
            sucesso: false,
            erro:
              "Já existe outro fornecedor com este CPF ou CNPJ.",
          },
          {
            status: 409,
          }
        );
      }
    }

    const supplier =
      await prisma.suppliers.update({
        where: {
          id,
        },
        data,
      });

    return NextResponse.json({
      sucesso: true,
      supplier,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar fornecedor:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar fornecedor.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID é obrigatório.",
        },
        {
          status: 400,
        }
      );
    }

    const supplier =
      await prisma.suppliers.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
        },
      });

    if (!supplier) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "Fornecedor não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    await prisma.$transaction(
      async (transaction) => {
        await transaction.products.updateMany({
          where: {
            supplier_id: id,
          },
          data: {
            supplier_id: null,
          },
        });

        await transaction.components.updateMany({
          where: {
            supplier_id: id,
          },
          data: {
            supplier_id: null,
          },
        });

        await transaction.movements.updateMany({
          where: { supplier_id: id },
          data: { supplier_id: null },
        });

        await transaction.suppliers.delete({
          where: {
            id,
          },
        });
      }
    );

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error(
      "Erro ao excluir fornecedor:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao excluir fornecedor.",
      },
      {
        status: 500,
      }
    );
  }
}
