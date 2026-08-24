import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { authorizeApi } from "@/lib/api-auth";
import {
  COMPONENT_DELETE_ROLES,
  canUnifyComponents,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ComponentData = {
  name?: string;
  category?: string;
  equipment?: string;
  supplier_id?: string | null;
  quantity?: number;
  min_stock?: number;
  equipment_names?: string[];
};

type EquipmentDivisionItem = {
  equipment_name: string;
  qty_per_equipment: number;
};

type NormalizedPayload = {
  data: ComponentData;
  equipmentDivision?: EquipmentDivisionItem[];
  error?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeSupplierId(value: unknown) {
  const supplierId = normalizeString(value);
  return supplierId || null;
}

function normalizeEquipmentNames(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (item): item is string =>
            typeof item === "string"
        )
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeStock(value: unknown) {
  const numberValue = Number(value ?? 0);

  if (
    !Number.isFinite(numberValue) ||
    numberValue < 0
  ) {
    return null;
  }

  return numberValue;
}

function normalizeEquipmentDivision(
  value: unknown
): {
  items?: EquipmentDivisionItem[];
  error?: string;
} {
  if (!Array.isArray(value)) {
    return {
      error:
        "A divisão por equipamento deve ser uma lista.",
    };
  }

  const equipmentMap =
    new Map<string, EquipmentDivisionItem>();

  for (const rawItem of value) {
    if (
      !rawItem ||
      typeof rawItem !== "object" ||
      Array.isArray(rawItem)
    ) {
      return {
        error:
          "Existe um item inválido na divisão por equipamento.",
      };
    }

    const item =
      rawItem as Record<string, unknown>;

    const equipmentName = normalizeString(
      item.equipment_name
    );

    const quantity = Number(
      item.qty_per_equipment
    );

    if (!equipmentName) {
      return {
        error:
          "Informe o equipamento da divisão.",
      };
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return {
        error:
          `Informe uma quantidade válida para ${equipmentName}.`,
      };
    }

    equipmentMap.set(equipmentName, {
      equipment_name: equipmentName,
      qty_per_equipment: quantity,
    });
  }

  return {
    items: Array.from(equipmentMap.values()),
  };
}

function normalizeComponentData(
  body: Record<string, unknown>,
  partial = false
): NormalizedPayload {
  const data: ComponentData = {};
  let equipmentDivision:
    | EquipmentDivisionItem[]
    | undefined;

  if (!partial || "name" in body) {
    data.name = normalizeString(body.name);
  }

  if (!partial || "category" in body) {
    data.category = normalizeString(
      body.category
    );
  }

  if (!partial || "equipment" in body) {
    data.equipment =
      normalizeString(body.equipment) ||
      "Estoque geral";
  }

  if (!partial || "supplier_id" in body) {
    data.supplier_id = normalizeSupplierId(
      body.supplier_id
    );
  }

  if (!partial || "quantity" in body) {
    const quantity = normalizeStock(
      body.quantity
    );

    if (quantity === null) {
      return {
        data,
        error:
          "A quantidade deve ser um número maior ou igual a zero.",
      };
    }

    data.quantity = quantity;
  }

  if (!partial || "min_stock" in body) {
    const minStock = normalizeStock(
      body.min_stock
    );

    if (minStock === null) {
      return {
        data,
        error:
          "O estoque mínimo deve ser um número maior ou igual a zero.",
      };
    }

    data.min_stock = minStock;
  }

  if ("equipment_division" in body) {
    const normalizedDivision =
      normalizeEquipmentDivision(
        body.equipment_division
      );

    if (normalizedDivision.error) {
      return {
        data,
        error: normalizedDivision.error,
      };
    }

    equipmentDivision =
      normalizedDivision.items || [];

    data.equipment_names =
      equipmentDivision.map(
        (item) => item.equipment_name
      );
  } else if (
    !partial ||
    "equipment_names" in body
  ) {
    data.equipment_names =
      normalizeEquipmentNames(
        body.equipment_names
      );
  }

  return {
    data,
    equipmentDivision,
  };
}

function buildUpdateData(
  data: ComponentData
): Prisma.componentsUncheckedUpdateInput {
  const updateData:
    Prisma.componentsUncheckedUpdateInput = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
  }

  if (data.category !== undefined) {
    updateData.category = data.category;
  }

  if (data.equipment !== undefined) {
    updateData.equipment = data.equipment;
  }

  if (data.supplier_id !== undefined) {
    updateData.supplier_id =
      data.supplier_id;
  }

  if (data.quantity !== undefined) {
    updateData.quantity = data.quantity;
  }

  if (data.min_stock !== undefined) {
    updateData.min_stock =
      data.min_stock;
  }

  if (
    data.equipment_names !== undefined
  ) {
    updateData.equipment_names =
      data.equipment_names;
  }

  return updateData;
}

function serializeComponent(component: any) {
  return {
    ...component,
    quantity: Number(component.quantity ?? 0),
    min_stock: Number(component.min_stock ?? 0),
    cost_price: Number(component.cost_price ?? 0),
    equipment_components:
      component.equipment_components?.map(
        (item) => ({
          ...item,
          qty_per_equipment: Number(
            item.qty_per_equipment
          ),
        })
      ) || [],
  };
}

export async function GET() {
  try {
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "funcionario",
      "tecnico",
    ]);
    if ("response" in authorization) return authorization.response;

    const components =
      await prisma.components.findMany({
        include: {
          equipment_components: {
            orderBy: {
              equipment_name: "asc",
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

    return NextResponse.json({
      sucesso: true,
      components: components.map(
        serializeComponent
      ),
    });
  } catch (error) {
    console.error(
      "Erro ao carregar componentes:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao carregar componentes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
) {
  try {
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "tecnico",
    ]);
    if ("response" in authorization) return authorization.response;

    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const normalized =
      normalizeComponentData(body);

    if (normalized.error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: normalized.error,
        },
        { status: 400 }
      );
    }

    const data = normalized.data;
    const division =
      normalized.equipmentDivision || [];

    if (!data.name) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "O nome do componente é obrigatório.",
        },
        { status: 400 }
      );
    }

    const component =
      await prisma.$transaction(
        async (transaction) => {
          const created =
            await transaction.components.create(
              {
                data: {
                  name: data.name!,
                  category:
                    data.category || "",
                  equipment:
                    data.equipment ||
                    "Estoque geral",
                  supplier_id:
                    data.supplier_id || null,
                  quantity:
                    data.quantity ?? 0,
                  min_stock:
                    data.min_stock ?? 0,
                  equipment_names:
                    division.length
                      ? division.map(
                          (item) =>
                            item.equipment_name
                        )
                      : data.equipment_names ||
                        [],
                },
              }
            );

          if (division.length) {
            await transaction
              .equipment_components
              .createMany({
                data: division.map(
                  (item) => ({
                    component_id:
                      created.id,
                    equipment_name:
                      item.equipment_name,
                    qty_per_equipment:
                      item.qty_per_equipment,
                  })
                ),
              });
          }

          return transaction.components
            .findUniqueOrThrow({
              where: {
                id: created.id,
              },
              include: {
                equipment_components: {
                  orderBy: {
                    equipment_name:
                      "asc",
                  },
                },
              },
            });
        }
      );

    return NextResponse.json(
      {
        sucesso: true,
        component:
          serializeComponent(component),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Erro ao criar componente:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao criar componente.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request
) {
  try {
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "tecnico",
    ]);
    if ("response" in authorization) return authorization.response;

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
        { status: 400 }
      );
    }

    const normalized =
      normalizeComponentData(body, true);

    if (normalized.error) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: normalized.error,
        },
        { status: 400 }
      );
    }

    const data = normalized.data;
    const division =
      normalized.equipmentDivision;

    if (
      "name" in data &&
      !data.name
    ) {
      return NextResponse.json(
        {
          sucesso: false,
          erro:
            "O nome do componente é obrigatório.",
        },
        { status: 400 }
      );
    }

    const component =
      await prisma.$transaction(
        async (transaction) => {
          await transaction.components.update({
            where: {
              id,
            },
            data: buildUpdateData(data),
          });

          if (division !== undefined) {
            await transaction
              .equipment_components
              .deleteMany({
                where: {
                  component_id: id,
                },
              });

            if (division.length) {
              await transaction
                .equipment_components
                .createMany({
                  data: division.map(
                    (item) => ({
                      component_id: id,
                      equipment_name:
                        item.equipment_name,
                      qty_per_equipment:
                        item.qty_per_equipment,
                    })
                  ),
                });
            }
          }

          return transaction.components
            .findUniqueOrThrow({
              where: {
                id,
              },
              include: {
                equipment_components: {
                  orderBy: {
                    equipment_name:
                      "asc",
                  },
                },
              },
            });
        }
      );

    return NextResponse.json({
      sucesso: true,
      component:
        serializeComponent(component),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar componente:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar componente.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request
) {
  try {
    const authorization = await authorizeApi(COMPONENT_DELETE_ROLES);
    if ("response" in authorization) return authorization.response;

    const { searchParams } = new URL(
      request.url
    );

    const id = normalizeString(
      searchParams.get("id")
    );

    if (!id) {
      return NextResponse.json(
        {
          sucesso: false,
          erro: "ID é obrigatório.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.movements.updateMany({ where: { component_id: id }, data: { component_id: null } });
      await tx.movements.updateMany({ where: { item_type: "componente", item_id: id }, data: { item_id: null } });
      await tx.components.delete({ where: { id } });
    });

    return NextResponse.json({
      sucesso: true,
    });
  } catch (error) {
    console.error(
      "Erro ao excluir componente:",
      error
    );

    return NextResponse.json(
      {
        sucesso: false,
        erro:
          error instanceof Error
            ? error.message
            : "Erro ao excluir componente.",
      },
      { status: 500 }
    );
  }
}


function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " " );
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeApi([
      "administrador",
      "gerente",
      "tecnico",
    ]);
    if ("response" in authorization) return authorization.response;

    const body = (await request.json()) as Record<string, any>;
    const action = normalizeString(body.action);

    if (
      action === "unify_duplicates" &&
      !canUnifyComponents(authorization.profile.role)
    ) {
      return NextResponse.json(
        { sucesso: false, erro: "Somente administradores podem unificar duplicados." },
        { status: 403 }
      );
    }

    if (action === "upsert_defaults") {
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) {
        return NextResponse.json({ sucesso: false, erro: "Nenhum componente padrão informado." }, { status: 400 });
      }

      let criados = 0;
      let atualizados = 0;

      await prisma.$transaction(async (tx) => {
        for (const raw of items) {
          const name = normalizeString(raw?.name);
          if (!name) continue;
          const category = normalizeString(raw?.category) || "Componente";
          const divisionResult = normalizeEquipmentDivision(raw?.equipment_division || []);
          if (divisionResult.error) throw new Error(divisionResult.error);
          const division = divisionResult.items || [];

          const existing = await tx.components.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
            include: { equipment_components: true },
            orderBy: { created_at: "asc" },
          });

          let componentId: string;
          const mergedDivision = new Map<string, number>();
          if (existing) {
            for (const item of existing.equipment_components) mergedDivision.set(item.equipment_name, Number(item.qty_per_equipment));
          }
          for (const item of division) mergedDivision.set(item.equipment_name, item.qty_per_equipment);

          if (existing) {
            componentId = existing.id;
            await tx.components.update({
              where: { id: existing.id },
              data: {
                category,
                equipment: "Estoque geral",
                equipment_names: Array.from(mergedDivision.keys()),
                updated_at: new Date(),
              },
            });
            atualizados += 1;
          } else {
            const created = await tx.components.create({
              data: {
                name,
                category,
                equipment: "Estoque geral",
                quantity: 0,
                min_stock: 0,
                equipment_names: Array.from(mergedDivision.keys()),
              },
            });
            componentId = created.id;
            criados += 1;
          }

          if (mergedDivision.size) {
            await tx.equipment_components.deleteMany({ where: { component_id: componentId } });
            await tx.equipment_components.createMany({
              data: Array.from(mergedDivision.entries()).map(([equipment_name, qty_per_equipment]) => ({
                component_id: componentId, equipment_name, qty_per_equipment,
              })),
            });
          }
        }
      });

      return NextResponse.json({ sucesso: true, criados, atualizados });
    }

    if (action === "unify_duplicates") {
      const components = await prisma.components.findMany({
        include: { equipment_components: true },
        orderBy: { created_at: "asc" },
      });
      const groups = new Map<string, typeof components>();
      for (const item of components) {
        const key = normalizeName(item.name);
        const group = groups.get(key) || [];
        group.push(item);
        groups.set(key, group);
      }

      let unificados = 0;
      await prisma.$transaction(async (tx) => {
        for (const group of groups.values()) {
          if (group.length <= 1) continue;
          const principal = group[0];
          const rest = group.slice(1);
          const restIds = rest.map((item) => item.id);
          const allIds = group.map((item) => item.id);
          const total = group.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
          const minStock = Math.max(...group.map((item) => Number(item.min_stock || 0)));
          const category = principal.category || group.find((item) => item.category)?.category || "Componente";
          const divisions = new Map<string, number>();
          for (const item of group) {
            for (const div of item.equipment_components) {
              divisions.set(div.equipment_name, Math.max(divisions.get(div.equipment_name) || 0, Number(div.qty_per_equipment || 0)));
            }
          }

          if (restIds.length) {
            await tx.movements.updateMany({ where: { component_id: { in: restIds } }, data: { component_id: principal.id } });
            await tx.movements.updateMany({ where: { item_type: "componente", item_id: { in: restIds } }, data: { item_id: principal.id } });
          }
          await tx.equipment_components.deleteMany({ where: { component_id: { in: allIds } } });
          await tx.components.update({
            where: { id: principal.id },
            data: {
              quantity: total,
              min_stock: minStock,
              category,
              equipment: "Estoque geral",
              equipment_names: Array.from(divisions.keys()),
              updated_at: new Date(),
            },
          });
          if (restIds.length) await tx.components.deleteMany({ where: { id: { in: restIds } } });
          if (divisions.size) {
            await tx.equipment_components.createMany({
              data: Array.from(divisions.entries()).map(([equipment_name, qty_per_equipment]) => ({
                component_id: principal.id, equipment_name, qty_per_equipment,
              })),
            });
          }
          unificados += rest.length;
        }
      });
      return NextResponse.json({ sucesso: true, unificados });
    }

    return NextResponse.json({ sucesso: false, erro: "Ação não reconhecida." }, { status: 400 });
  } catch (error) {
    console.error("Erro na ação de componentes:", error);
    return NextResponse.json({ sucesso: false, erro: error instanceof Error ? error.message : "Erro ao processar componentes." }, { status: 500 });
  }
}
