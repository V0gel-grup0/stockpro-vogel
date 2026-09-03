export type CadastroPessoaInput = {
  name: unknown;
  document: unknown;
  phone: unknown;
  cep: unknown;
  city: unknown;
  street: unknown;
  number: unknown;
  no_number: unknown;
  neighborhood: unknown;
};

export type CadastroPessoaNormalizado = {
  name: string;
  document: string;
  phone: string;
  cep: string;
  city: string;
  street: string;
  number: string;
  no_number: boolean;
  neighborhood: string;
};

export type ResultadoValidacaoCadastro =
  | { valido: true; dados: CadastroPessoaNormalizado }
  | { valido: false; erro: string };

export function somenteDigitos(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizarTexto(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function todosCaracteresIguais(value: string): boolean {
  return /^([A-Za-z0-9])\1+$/.test(value.replace(/[\s./,\-]/g, ""));
}

const INVALID_TEXT_VALUES = new Set([
  "teste",
  "nao informado",
  "nao possui",
  "sem informacao",
  "desconhecido",
  "xxx",
  "aaaa",
]);

function textoValido(value: string, minimumLength: number): boolean {
  if (value.length < minimumLength) return false;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) return false;
  if (todosCaracteresIguais(value)) return false;

  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return !INVALID_TEXT_VALUES.has(normalized);
}

export function validarNomeCompleto(value: unknown, documentValue: unknown): boolean {
  const name = normalizarTexto(value);
  const document = somenteDigitos(documentValue);

  if (!textoValido(name, 3)) return false;

  // 14 dígitos indicam cadastro empresarial para fins da regra de nome.
  // O CNPJ em si não é validado nem bloqueia o cadastro.
  if (document.length === 14) {
    return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name);
  }

  const parts = name.split(" ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return false;

  const particles = new Set(["da", "das", "de", "do", "dos", "e"]);

  return parts.every((part) => {
    const normalizedPart = part
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (particles.has(normalizedPart)) return true;
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’-]+$/.test(part)) return false;
    if (INVALID_TEXT_VALUES.has(normalizedPart)) return false;

    const lettersOnly = normalizedPart.replace(/['’\-]/g, "");
    const obviousKeyboardSequence =
      /^(?:asdf(?:gh)?|qwer(?:ty)?|zxcv(?:bn)?|hjkl)$/.test(lettersOnly);

    if (obviousKeyboardSequence || /([a-z])\1{3,}/.test(lettersOnly)) return false;
    return lettersOnly.length >= 2;
  });
}

function digitosRepetidos(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function calcularDigitoCpf(base: string): number {
  const initialWeight = base.length + 1;
  const sum = base.split("").reduce(
    (total, digit, index) => total + Number(digit) * (initialWeight - index),
    0
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function validarCpf(value: unknown): boolean {
  const cpf = somenteDigitos(value);
  if (cpf.length !== 11 || digitosRepetidos(cpf)) return false;
  const firstDigit = calcularDigitoCpf(cpf.slice(0, 9));
  if (firstDigit !== Number(cpf[9])) return false;
  const secondDigit = calcularDigitoCpf(cpf.slice(0, 10));
  return secondDigit === Number(cpf[10]);
}

export function existeCpfDuplicado(
  value: unknown,
  clients: Array<{ id: string; document: unknown }>,
  currentClientId?: string
): boolean {
  const cpf = somenteDigitos(value);
  if (cpf.length !== 11) return false;
  return clients.some(
    (client) => client.id !== currentClientId && somenteDigitos(client.document) === cpf
  );
}

export function validarCnpj(value: unknown): boolean {
  const cnpj = somenteDigitos(value);
  if (cnpj.length !== 14 || digitosRepetidos(cnpj)) return false;

  const calcularDigito = (base: string, weights: number[]) => {
    const sum = base.split("").reduce(
      (total, number, index) => total + Number(number) * weights[index],
      0
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calcularDigito(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );
  if (firstDigit !== Number(cnpj[12])) return false;

  const secondDigit = calcularDigito(
    cnpj.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );
  return secondDigit === Number(cnpj[13]);
}

export function validarCpfCnpj(value: unknown): boolean {
  const document = somenteDigitos(value);
  if (document.length === 11) return validarCpf(document);
  if (document.length === 14) return validarCnpj(document);
  return false;
}

export function validarTelefone(value: unknown): boolean {
  const phone = somenteDigitos(value);

  if (![10, 11].includes(phone.length) || digitosRepetidos(phone)) return false;

  const areaCode = phone.slice(0, 2);
  const subscriberNumber = phone.slice(2);

  if (
    areaCode === "00" ||
    Number(areaCode) < 11 ||
    /^0+$/.test(subscriberNumber)
  ) {
    return false;
  }

  return true;
}

export function validarCep(value: unknown): boolean {
  const cep = somenteDigitos(value);
  return cep.length === 8 && !digitosRepetidos(cep);
}

export function validarCadastroPessoa(
  input: CadastroPessoaInput
): ResultadoValidacaoCadastro {
  const name = normalizarTexto(input.name);
  const document = somenteDigitos(input.document);
  const phone = somenteDigitos(input.phone);
  const cep = somenteDigitos(input.cep);
  const city = normalizarTexto(input.city);
  const street = normalizarTexto(input.street);
  const number = normalizarTexto(input.number);
  const no_number = Boolean(input.no_number);
  const neighborhood = normalizarTexto(input.neighborhood);

  // Bloqueios mantidos: nome, telefone e cidade.
  if (!validarNomeCompleto(name, document)) {
    return {
      valido: false,
      erro:
        document.length === 14
          ? "Informe uma razão social válida."
          : "Informe o nome completo, com nome e sobrenome.",
    };
  }

  if (!validarTelefone(phone)) {
    return {
      valido: false,
      erro: "Informe um telefone válido com DDD.",
    };
  }

  if (!textoValido(city, 2)) {
    return {
      valido: false,
      erro: "Informe uma cidade válida.",
    };
  }

  // CPF/CNPJ, CEP, rua, bairro e número ficam informativos e não bloqueiam.
  return {
    valido: true,
    dados: {
      name,
      document,
      phone,
      cep,
      city,
      street,
      number: no_number ? "" : number,
      no_number,
      neighborhood,
    },
  };
}
