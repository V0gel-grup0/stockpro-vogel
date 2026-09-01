import type { Prisma } from "@/generated/prisma/client";
import {
  getClientVisibilityPolicy,
  type ClientVisibilityProfile,
} from "@/lib/client-visibility-policy";

export function buildClientVisibilityWhere(
  profile: ClientVisibilityProfile
): Prisma.clientsWhereInput | undefined {
  const policy = getClientVisibilityPolicy(profile);

  if (policy.mode === "all") return undefined;

  const opportunityConditions: Prisma.crm_opportunitiesWhereInput[] = [
    { created_by: policy.profileId },
    { responsible_id: policy.profileId },
  ];
  const orderConditions: Prisma.ordersWhereInput[] = [
    { created_by: policy.profileId },
  ];

  if (policy.mode === "seller") {
    const linkedRepresentative = {
      role: "representante" as const,
      responsible_seller_id: policy.profileId,
    };
    opportunityConditions.push(
      { profiles_created_by: { is: linkedRepresentative } },
      { profiles_responsible: { is: linkedRepresentative } }
    );
    orderConditions.push({ profiles: { is: linkedRepresentative } });
  }

  const ownConditions: Prisma.clientsWhereInput[] = [
    { created_by: policy.profileId },
    { crm_opportunities: { some: { OR: opportunityConditions } } },
    { orders: { some: { OR: orderConditions } } },
  ];

  if (policy.mode === "seller") {
    ownConditions.push({
      profiles: {
        is: {
          role: "representante",
          responsible_seller_id: policy.profileId,
        },
      },
    });
  }

  return { OR: ownConditions };
}

export function buildAccessibleClientWhere(
  profile: ClientVisibilityProfile,
  clientId: string
): Prisma.clientsWhereInput {
  const visibilityWhere = buildClientVisibilityWhere(profile);

  return visibilityWhere
    ? { AND: [{ id: clientId }, visibilityWhere] }
    : { id: clientId };
}

function buildOwnCrmOpportunityWhere(
  profile: ClientVisibilityProfile
): Prisma.crm_opportunitiesWhereInput | undefined {
  if (profile.role === "administrador") return undefined;

  return {
    OR: [
      { created_by: profile.id },
      { responsible_id: profile.id },
    ],
  };
}

export function buildOpportunityVisibilityWhere(
  profile: ClientVisibilityProfile
): Prisma.crm_opportunitiesWhereInput | undefined {
  return buildOwnCrmOpportunityWhere(profile);
}

export function buildOpportunityManagementWhere(
  profile: ClientVisibilityProfile
): Prisma.crm_opportunitiesWhereInput | undefined {
  return buildOwnCrmOpportunityWhere(profile);
}

export function buildActivityVisibilityWhere(
  profile: ClientVisibilityProfile
): Prisma.crm_activitiesWhereInput | undefined {
  if (profile.role === "administrador") return undefined;

  const opportunityVisibility = buildOwnCrmOpportunityWhere(profile);

  return {
    OR: [
      { created_by: profile.id },
      { crm_opportunities: { is: opportunityVisibility } },
    ],
  };
}
