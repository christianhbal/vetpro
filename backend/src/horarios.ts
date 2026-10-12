// Los horarios que la veterinaria ofrece: de 10:00 a 18:30, cada media hora.
// Los usan el generador de ejemplos y el que arma los dias completos, asi que
// viven en un solo lado.
export const HORARIOS = Array.from({ length: 18 }, (_valor, i) => {
  const minutos = 10 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
});

/** Un turno existe si es real (esDemo) o si es de los que completan un dia. */
export const MARCA_DIA_COMPLETO = 'ocupado por el ejemplo';