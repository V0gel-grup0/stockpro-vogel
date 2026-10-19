// One role matrix shared by navigation, rendered funnels and every CRM API.
export type CrmModule = "commercial" | "assembly" | "internal" | "service";
export const CRM_COMMERCIAL_ROLES = ["administrador", "gerente", "vendedor", "funcionario", "representante"] as const;
export const CRM_INTERNAL_ROLES = ["administrador", "gerente", "vendedor", "funcionario", "tecnico"] as const;
export function canAccessCrm(role: string, module: CrmModule): boolean {
  if (role === "administrador" || role === "gerente") return true;
  if (module === "commercial") return ["vendedor", "funcionario", "representante"].includes(role);
  if (module === "internal") return ["vendedor", "funcionario", "tecnico"].includes(role);
  if (module === "assembly") return role === "tecnico";
  return false;
}
