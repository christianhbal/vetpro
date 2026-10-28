const PREFIJO_CHECK_IN = 'vetpro://check-in';

// Un solo QR para todas las sedes: el turno del cliente ya sabe en qué sede es,
// así que el código no tiene que llevar la sede adentro.
export function checkInVetPro(): string {
  return PREFIJO_CHECK_IN;
}

// Acepta el código nuevo y los QR viejos que traían ?sedeId=... para no dejar
// de funcionar con los carteles ya impresos.
export function esCheckInVetPro(escaneado: string): boolean {
  return escaneado.split('?')[0] === PREFIJO_CHECK_IN;
}
