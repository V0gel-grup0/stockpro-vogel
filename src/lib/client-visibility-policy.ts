import type { AppRole } from "@/lib/permissions";

export type ClientVisibilityProfile = {
  id: string;
  role: AppRole;
};

export type ClientVisibilitySnapshot = {
  created_by: string | null;
  creator?: {
    role: string;
    responsible_seller_id: string | null;
  } | null;
  opportunities?: Array<{
    created_by: string | null;
    responsible_id: string | null;
    creator?: {
      role: string;
      responsible_seller_id: string | null;
    } | null;
    responsible?: {
      role: string;
      responsible_seller_id: string | null;
    } | null;
  }>;
  orders?: Array<{
    created_by: string | null;
    creator?: {
      role: string;
      responsible_seller_id: string | null;
    } | null;
  }>;
};

export type ClientVisibilityPolicy =
  | { mode: "all" }
  | { mode: "own"; profileId: string }
  | { mode: "seller"; profileId: string };

export function getClientVisibilityPolicy(
  profile: ClientVisibilityProfile
): ClientVisibilityPolicy {
  if (profile.role === "administrador") {
    return { mode: "all" };
  }

  if (profile.role === "vendedor") {
    return { mode: "seller", profileId: profile.id };
  }

  return { mode: "own", profileId: profile.id };
}

export function canViewClientSnapshot(
  profile: ClientVisibilityProfile,
  client: ClientVisibilitySnapshot
) {
  const policy = getClientVisibilityPolicy(profile);

  if (policy.mode === "all") return true;
  if (client.created_by === policy.profileId) return true;

  if (
    policy.mode === "seller" &&
    client.creator?.role === "representante" &&
    client.creator.responsible_seller_id === policy.profileId
  ) {
    return true;
  }

  const hasVisibleOpportunity = client.opportunities?.some(
    (opportunity) =>
      opportunity.created_by === policy.profileId ||
      opportunity.responsible_id === policy.profileId ||
      (policy.mode === "seller" &&
        (opportunity.creator?.responsible_seller_id === policy.profileId ||
          opportunity.responsible?.responsible_seller_id === policy.profileId))
  );

  if (hasVisibleOpportunity) return true;

  return Boolean(
    client.orders?.some(
      (order) =>
        order.created_by === policy.profileId ||
        (policy.mode === "seller" &&
          order.creator?.role === "representante" &&
          order.creator.responsible_seller_id === policy.profileId)
    )
  );
}
