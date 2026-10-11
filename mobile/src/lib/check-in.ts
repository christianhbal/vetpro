import type { SedeVeterinaria } from './datos';

const PREFIJO_CHECK_IN = 'vetpro://check-in';

export function checkInDeSede(sede: SedeVeterinaria): string {
  return `${PREFIJO_CHECK_IN}?sede=${encodeURIComponent(sede)}`;
}

export function sedeDeCheckIn(escaneado: string): SedeVeterinaria | null {
  const [base, consulta] = escaneado.split('?');
  if (base !== PREFIJO_CHECK_IN) return null;

  const valor = new URLSearchParams(consulta ?? '').get('sede');
  if (!valor) return null;

  return ['Recoleta', 'San Isidro', 'Vicente López'].includes(valor)
    ? (valor as SedeVeterinaria)
    : null;
}