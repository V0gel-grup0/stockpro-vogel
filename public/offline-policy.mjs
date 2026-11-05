export const COMMERCIAL_ROLES=['administrador','gerente','vendedor','funcionario','representante'];
export const ASSEMBLY_ROLES=['administrador','gerente','tecnico'];
export const EXIT_ROLES=['administrador','gerente','funcionario'];
export const OFFLINE_ROLES=[...new Set([...COMMERCIAL_ROLES,...ASSEMBLY_ROLES,...EXIT_ROLES])];
export function canQueueOperation(role,type){
  if(['client','order'].includes(type))return COMMERCIAL_ROLES.includes(role);
  if(type==='assembly')return ASSEMBLY_ROLES.includes(role);
  if(['order_exit','product_exit'].includes(type))return EXIT_ROLES.includes(role);
  return false;
}
