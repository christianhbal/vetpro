export type Mascota = {
  id: number;
  nombre: string;
  especie: string;
  edad: string;
};

export type Cita = {
  id: number;
  mascota: string;
  motivo: string;
  fecha: string;
};

export const usuario = {
  id: 1,
  nombre: 'Juan Perez',
  email: 'juan@gmail.com',
};

export const fotoMascota =
  'https://images.unsplash.com/photo-1552053831-71594a27632d?w=900&auto=format&fit=crop&q=85';

export const mascotas: Mascota[] = [
  { id: 1, nombre: 'Lola', especie: 'Perro', edad: '3 años' },
  { id: 2, nombre: 'Mora', especie: 'Gato', edad: '2 años' },
  { id: 3, nombre: 'Tito', especie: 'Perro', edad: '5 años' },
  { id: 4, nombre: 'Pepe', especie: 'Perro', edad: '4 años' },
];

export const citas: Cita[] = [
  { id: 1, mascota: 'Lola', motivo: 'Vacuna Antirrábica', fecha: '28 Sept - 10:00 AM' },
  { id: 2, mascota: 'Mora', motivo: 'Control de rutina', fecha: '02 Oct - 16:30 PM' },
  { id: 3, mascota: 'Pepe', motivo: 'Control de rutina', fecha: '12 Oct - 6:30 AM' },
];