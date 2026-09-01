export const APP_ROLES = [
  "administrador",
  "gerente",
  "vendedor",
  "funcionario",
  "tecnico",
  "representante",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const PRODUCT_READ_ROLES = [
  "administrador",
  "gerente",
  "vendedor",
  "funcionario",
  "representante",
] as const satisfies readonly AppRole[];

export const PRODUCT_WRITE_ROLES = [
  "administrador",
  "gerente",
  "funcionario",
] as const satisfies readonly AppRole[];

export const PRODUCT_DELETE_ROLES = [
  "administrador",
  "gerente",
] as const satisfies readonly AppRole[];

export const SUPPLIER_READ_ROLES = [
  "administrador",
  "gerente",
  "funcionario",
  "tecnico",
] as const satisfies readonly AppRole[];

export const SUPPLIER_WRITE_ROLES = [
  "administrador",
  "gerente",
] as const satisfies readonly AppRole[];

export const ORDER_ROLES = [
  "administrador",
  "gerente",
  "vendedor",
  "funcionario",
  "representante",
] as const satisfies readonly AppRole[];

export const ORDER_STATUS_ROLES = [
  "administrador",
  "gerente",
  "vendedor",
] as const satisfies readonly AppRole[];

export const ORDER_DELETE_ROLES = [
  "administrador",
] as const satisfies readonly AppRole[];

export const ORDER_NF_WRITE_ROLES = [
  "administrador",
  "gerente",
] as const satisfies readonly AppRole[];

export const COMPONENT_DELETE_ROLES = [
  "administrador",
  "gerente",
] as const satisfies readonly AppRole[];

export const ASSEMBLY_DELETE_ROLES = [
  "administrador",
  "gerente",
] as const satisfies readonly AppRole[];

export const COMPONENT_UNIFY_ROLES = [
  "administrador",
] as const satisfies readonly AppRole[];

export const REPRESENTATIVE_REVIEW_ROLES = [
  "administrador",
  "vendedor",
] as const satisfies readonly AppRole[];

function roleAllowed(
  role: string,
  allowedRoles: readonly AppRole[]
): role is AppRole {
  return allowedRoles.includes(role as AppRole);
}

export const canReadProducts = (role: string) =>
  roleAllowed(role, PRODUCT_READ_ROLES);
export const canWriteProducts = (role: string) =>
  roleAllowed(role, PRODUCT_WRITE_ROLES);
export const canDeleteProducts = (role: string) =>
  roleAllowed(role, PRODUCT_DELETE_ROLES);
export const canReadSuppliers = (role: string) =>
  roleAllowed(role, SUPPLIER_READ_ROLES);
export const canWriteSuppliers = (role: string) =>
  roleAllowed(role, SUPPLIER_WRITE_ROLES);
export const canUpdateOrderStatus = (role: string) =>
  roleAllowed(role, ORDER_STATUS_ROLES);
export const canDeleteOrder = (role: string) =>
  roleAllowed(role, ORDER_DELETE_ROLES);
export const canAttachOrderNf = (role: string) =>
  roleAllowed(role, ORDER_NF_WRITE_ROLES);
export const canDeleteComponent = (role: string) =>
  roleAllowed(role, COMPONENT_DELETE_ROLES);
export const canDeleteAssembly = (role: string) =>
  roleAllowed(role, ASSEMBLY_DELETE_ROLES);
export const canUnifyComponents = (role: string) =>
  roleAllowed(role, COMPONENT_UNIFY_ROLES);

export function canManageOpportunityRecord(
  profile: { id: string; role: string },
  opportunity: {
    created_by: string | null;
    responsible_id: string | null;
  }
) {
  if (profile.role === "administrador" || profile.role === "gerente") {
    return true;
  }

  return (
    (profile.role === "vendedor" || profile.role === "representante") &&
    (opportunity.created_by === profile.id ||
      opportunity.responsible_id === profile.id)
  );
}

export function canReviewRepresentative(
  reviewer: { id: string; role: string },
  representative: {
    role: string;
    responsible_seller_id: string | null;
  }
) {
  if (
    representative.role !== "representante" ||
    !roleAllowed(reviewer.role, REPRESENTATIVE_REVIEW_ROLES)
  ) {
    return false;
  }

  return (
    reviewer.role === "administrador" ||
    representative.responsible_seller_id === reviewer.id
  );
}
