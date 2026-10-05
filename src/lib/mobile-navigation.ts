export function mobileTabs(menus: readonly string[]) {
  const priorities = ["Dashboard", "CRM", "Pedidos", "Montagens", "Produtos", "Clientes", "Meu Perfil"];
  return priorities.filter((page) => menus.includes(page)).slice(0, 3);
}

export function mobilePageLabel(page: string) {
  return ({ Dashboard: "Início", "Equipamentos Montados": "Equipamentos", "Análise de Cadastros": "Cadastros", "Meu Perfil": "Perfil", Montagens: "Montagens" } as Record<string, string>)[page] || page;
}
