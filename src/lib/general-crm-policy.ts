export const GENERAL_CRM_ROLES = ["administrador", "gerente", "vendedor", "representante", "funcionario", "tecnico"] as const;
export const GENERAL_CRM_STAGES = [
  { value: "new", label: "Nova" },
  { value: "in_progress", label: "Em andamento" },
  { value: "waiting", label: "Aguardando" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
] as const;
export const GENERAL_CRM_PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;
export type GeneralCrmStage = typeof GENERAL_CRM_STAGES[number]["value"];
export type GeneralCrmPriority = typeof GENERAL_CRM_PRIORITIES[number]["value"];
export type GeneralCrmActor = { id: string; role: string };
export type GeneralDemand = {
  id: string; title: string; description: string; status: GeneralCrmStage; priority: GeneralCrmPriority;
  assigned_to: string | null; created_by: string | null; due_at: string | null;
  completed_at: string | null; created_at: string; updated_at: string;
  responsible_name?: string | null; creator_name?: string | null;
};
export type GeneralCrmResponsible = { id: string; name: string; role: string };
export const isGeneralCrmManager = (actor: GeneralCrmActor) => ["administrador", "gerente"].includes(actor.role);
export const canManageGeneralDemand = (actor: GeneralCrmActor, demand: Pick<GeneralDemand, "created_by" | "assigned_to">) =>
  isGeneralCrmManager(actor) || demand.created_by === actor.id || demand.assigned_to === actor.id;
export const canAssignGeneralDemand = (actor: GeneralCrmActor, id: string | null) => !id || id === actor.id || isGeneralCrmManager(actor);
export const isGeneralDemandOverdue = (demand: Pick<GeneralDemand, "status" | "due_at">, now = Date.now()) =>
  !["completed", "cancelled"].includes(demand.status) && Boolean(demand.due_at && new Date(demand.due_at).getTime() < now);
export const isGeneralCrmUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export class GeneralCrmInputError extends Error {}
export function validateGeneralDemand(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GeneralCrmInputError("Dados da demanda inválidos.");
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 200) throw new GeneralCrmInputError("Informe um título de até 200 caracteres.");
  const description = body.description == null ? "" : body.description;
  if (typeof description !== "string" || description.length > 5000) throw new GeneralCrmInputError("A descrição deve ter até 5.000 caracteres.");
  const status = body.status ?? "new";
  if (!GENERAL_CRM_STAGES.some((stage) => stage.value === status)) throw new GeneralCrmInputError("Etapa inválida.");
  const priority = body.priority ?? "normal";
  if (!GENERAL_CRM_PRIORITIES.some((item) => item.value === priority)) throw new GeneralCrmInputError("Prioridade inválida.");
  const assigned_to = body.assigned_to == null || body.assigned_to === "" ? null : body.assigned_to;
  if (assigned_to !== null && !isGeneralCrmUuid(assigned_to)) throw new GeneralCrmInputError("Responsável inválido.");
  let due_at: Date | null = null;
  if (body.due_at) {
    if (typeof body.due_at !== "string" && !(body.due_at instanceof Date)) throw new GeneralCrmInputError("Prazo inválido.");
    due_at = new Date(String(body.due_at));
    if (Number.isNaN(due_at.getTime())) throw new GeneralCrmInputError("Prazo inválido.");
  }
  return { title, description: description.trim(), status: status as GeneralCrmStage, priority: priority as GeneralCrmPriority, assigned_to: assigned_to as string | null, due_at };
}
