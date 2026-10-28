const PREFIJO_CHECK_IN = 'vetpro://check-in';

export function checkInDeSede(id: number): string {
  return `${PREFIJO_CHECK_IN}?sedeId=${id}`;
}

export function sedeDeCheckIn(escaneado: string): string | null {
  const [base, consulta] = escaneado.split('?');
  if (base !== PREFIJO_CHECK_IN) return null;
  const params = new URLSearchParams(consulta ?? '');
  const id = params.get('sedeId');
  const nombre = params.get('sede');
  return (id && /^[1-9]\d*$/.test(id)) || (nombre && nombre.trim()) ? escaneado : null;
}
