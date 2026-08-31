export const REPRESENTATIVE_LINK_REQUIRED_MESSAGE =
  "Representante aguardando vínculo com vendedor responsável.";

type AccessProfile = {
  role: string;
  responsible_seller_id?: string | null;
};

type ResponsibleSeller = {
  id: string;
  role: string;
  status: string;
} | null;

export function hasValidRepresentativeAccess(
  profile: AccessProfile,
  responsibleSeller: ResponsibleSeller
) {
  if (profile.role !== "representante") {
    return true;
  }

  return Boolean(
    profile.responsible_seller_id &&
      responsibleSeller &&
      responsibleSeller.id === profile.responsible_seller_id &&
      responsibleSeller.role === "vendedor" &&
      responsibleSeller.status === "approved"
  );
}
