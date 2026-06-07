export type Vehicle = {
  make: string;
  model: string;
  years: number[];
};

const yearRange = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

export const VEHICLES: Vehicle[] = [
  { make: "Toyota", model: "Camry", years: yearRange },
  { make: "Toyota", model: "Corolla", years: yearRange },
  { make: "Toyota", model: "RAV4", years: yearRange },
  { make: "Honda", model: "Civic", years: yearRange },
  { make: "Honda", model: "Accord", years: yearRange },
  { make: "Honda", model: "CR-V", years: yearRange },
  { make: "Ford", model: "F-150", years: yearRange },
  { make: "Ford", model: "Escape", years: yearRange },
  { make: "Chevrolet", model: "Silverado", years: yearRange },
  { make: "Chevrolet", model: "Equinox", years: yearRange },
  { make: "Hyundai", model: "Tucson", years: yearRange },
  { make: "Hyundai", model: "Elantra", years: yearRange },
  { make: "BMW", model: "3 Series", years: yearRange },
  { make: "Mercedes-Benz", model: "C-Class", years: yearRange },
  { make: "Subaru", model: "Outback", years: yearRange },
  { make: "Subaru", model: "Forester", years: yearRange },
  { make: "Nissan", model: "Altima", years: yearRange },
  { make: "Nissan", model: "Rogue", years: yearRange },
];

export function getMakes(): string[] {
  return [...new Set(VEHICLES.map((v) => v.make))];
}

export function getModels(make: string): string[] {
  return VEHICLES.filter((v) => v.make === make).map((v) => v.model);
}

export function getYears(make: string, model: string): number[] {
  const vehicle = VEHICLES.find((v) => v.make === make && v.model === model);
  return vehicle ? vehicle.years : [];
}
