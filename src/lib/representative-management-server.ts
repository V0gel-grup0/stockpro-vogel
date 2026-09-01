import { prisma } from "@/lib/prisma";
import {
  canAccessRepresentativeManagement,
  type RepresentativeActor,
} from "@/lib/representative-management-policy";

export const representativeManagementProfileSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  representative_company: true,
  representative_region: true,
  responsible_seller_id: true,
  profiles_profiles_responsible_seller_idToprofiles: {
    select: { id: true, name: true, email: true },
  },
} as const;

export async function accessibleRepresentative(
  actor: RepresentativeActor,
  representativeId: string
) {
  const representative = await prisma.profiles.findUnique({
    where: { id: representativeId },
    select: representativeManagementProfileSelect,
  });

  if (
    !representative ||
    !canAccessRepresentativeManagement(actor, {
      id: representative.id,
      role: representative.role,
      responsible_seller_id: representative.responsible_seller_id,
    })
  ) {
    return null;
  }

  return representative;
}

export function representativeStructureMissing(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: { code?: string; table?: string };
    message?: string;
  };
  const message = String(candidate?.message || "");
  return (
    candidate?.code === "P2021" ||
    (candidate?.code === "P2010" && candidate?.meta?.code === "42P01") ||
    message.includes("representative_") && message.includes("does not exist")
  );
}
