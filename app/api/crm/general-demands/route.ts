import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/prisma-json";
import { ensureGeneralCrmTable } from "@/lib/general-crm-server";
import {
  GENERAL_CRM_ROLES, GeneralCrmInputError, canAssignGeneralDemand,
  canManageGeneralDemand, isGeneralCrmManager, isGeneralCrmUuid, validateGeneralDemand,
  type GeneralCrmActor, type GeneralCrmResponsible, type GeneralDemand,
} from "@/lib/general-crm-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(toJsonSafe(data), { status, headers: { "Cache-Control": "private, no-store" } });
const error = (message: string, status: number) => json({ sucesso: false, erro: message }, status);

async function validateAssignee(actor: GeneralCrmActor, id: string | null) {
  if (!canAssignGeneralDemand(actor, id)) return error("Você só pode atribuir demandas a si mesmo.", 403);
  if (!id) return null;
  const responsible = await prisma.profiles.findUnique({ where: { id }, select: { role: true, status: true } });
  if (!responsible || responsible.status !== "approved" || !GENERAL_CRM_ROLES.includes(responsible.role as typeof GENERAL_CRM_ROLES[number])) return error("Responsável indisponível.", 400);
  return null;
}
function failure(cause: unknown) {
  if (cause instanceof SyntaxError) return error("Dados inválidos.", 400);
  if (cause instanceof GeneralCrmInputError) return error(cause.message, 400);
  console.error("Erro no CRM geral:", cause);
  return error("Não foi possível concluir a operação no CRM geral. Tente novamente.", 500);
}

export async function GET() {
  try {
    const auth = await authorizeApi(GENERAL_CRM_ROLES);
    if ("response" in auth) return auth.response;
    await ensureGeneralCrmTable();
    const manager = isGeneralCrmManager(auth.profile);
    const [demands, responsibles] = await Promise.all([
      prisma.$queryRaw<GeneralDemand[]>`SELECT d.*, r.name AS responsible_name, c.name AS creator_name
        FROM crm_general_demands d
        LEFT JOIN profiles r ON r.id = d.assigned_to
        LEFT JOIN profiles c ON c.id = d.created_by
        WHERE (${manager}::boolean OR d.created_by = ${auth.profile.id}::uuid OR d.assigned_to = ${auth.profile.id}::uuid)
        ORDER BY d.created_at DESC, d.id DESC`,
      prisma.profiles.findMany({
        where: { status: "approved", role: { in: [...GENERAL_CRM_ROLES] }, ...(!manager ? { id: auth.profile.id } : {}) },
        select: { id: true, name: true, role: true }, orderBy: { name: "asc" },
      }) as Promise<GeneralCrmResponsible[]>,
    ]);
    return json({ sucesso: true, demands, responsibles });
  } catch (cause) { return failure(cause); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeApi(GENERAL_CRM_ROLES);
    if ("response" in auth) return auth.response;
    const input = validateGeneralDemand(await request.json());
    const invalid = await validateAssignee(auth.profile, input.assigned_to);
    if (invalid) return invalid;
    await ensureGeneralCrmTable();
    const [demand] = await prisma.$queryRaw<GeneralDemand[]>`INSERT INTO crm_general_demands
      (title, description, status, priority, assigned_to, created_by, due_at, completed_at)
      VALUES (${input.title}, ${input.description}, ${input.status}, ${input.priority}, ${input.assigned_to}::uuid,
        ${auth.profile.id}::uuid, ${input.due_at}, CASE WHEN ${input.status} = 'completed' THEN now() ELSE NULL END)
      RETURNING *`;
    return json({ sucesso: true, demand }, 201);
  } catch (cause) { return failure(cause); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeApi(GENERAL_CRM_ROLES);
    if ("response" in auth) return auth.response;
    const body = await request.json();
    if (!body || !isGeneralCrmUuid(body.id)) return error("Demanda inválida.", 400);
    await ensureGeneralCrmTable();
    const manager = isGeneralCrmManager(auth.profile);
    const [current] = await prisma.$queryRaw<GeneralDemand[]>`SELECT * FROM crm_general_demands
      WHERE id = ${body.id}::uuid AND (${manager}::boolean OR created_by = ${auth.profile.id}::uuid OR assigned_to = ${auth.profile.id}::uuid)`;
    if (!current || !canManageGeneralDemand(auth.profile, current)) return error("Demanda não encontrada ou sem permissão.", 404);
    const input = validateGeneralDemand({ ...current, ...body });
    // An assignee may keep the current assignment while editing/moving the demand.
    if (input.assigned_to !== current.assigned_to) {
      const invalid = await validateAssignee(auth.profile, input.assigned_to);
      if (invalid) return invalid;
    }
    const [demand] = await prisma.$queryRaw<GeneralDemand[]>`UPDATE crm_general_demands SET
      title = ${input.title}, description = ${input.description}, status = ${input.status}, priority = ${input.priority},
      assigned_to = ${input.assigned_to}::uuid, due_at = ${input.due_at}, updated_at = now(),
      completed_at = CASE WHEN ${input.status} = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END
      WHERE id = ${body.id}::uuid AND (${manager}::boolean OR created_by = ${auth.profile.id}::uuid OR assigned_to = ${auth.profile.id}::uuid)
      RETURNING *`;
    if (!demand) return error("Demanda não encontrada ou sem permissão.", 404);
    return json({ sucesso: true, demand });
  } catch (cause) { return failure(cause); }
}
