import { SUPPLIERS } from "./suppliers";

export type FitmentEntry = {
  make: string;
  model: string;
  years: number[];
};

export type SupplierEntry = {
  supplierId: string;
  price: number;
  brand: string;
  inStock: boolean;
  deliveryLabel: string;
  deliveryDays: number;
  warranty: string;
};

export type Part = {
  id: string;
  category: string;
  name: string;
  partNumber: string;
  fitment: FitmentEntry[];
  basePrice: number;
  imageUrl: string;
  videoUrl: string;
  suppliers: SupplierEntry[];
};

const yearRange = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

const commonFitment: FitmentEntry[] = [
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
  { make: "Subaru", model: "Outback", years: yearRange },
  { make: "Subaru", model: "Forester", years: yearRange },
  { make: "Nissan", model: "Altima", years: yearRange },
  { make: "Nissan", model: "Rogue", years: yearRange },
];

const europeanFitment: FitmentEntry[] = [
  { make: "BMW", model: "3 Series", years: yearRange },
  { make: "Mercedes-Benz", model: "C-Class", years: yearRange },
];

const allFitment: FitmentEntry[] = [...commonFitment, ...europeanFitment];

function buildSuppliers(
  basePrice: number,
  brands: Record<string, string>,
  warranties: Record<string, string>,
  isEuropean = false
): SupplierEntry[] {
  const adjustedBase = isEuropean ? basePrice * 1.5 : basePrice;
  return SUPPLIERS.map((s) => ({
    supplierId: s.id,
    price: Math.round(adjustedBase * s.priceMultiplier * 100) / 100,
    brand: brands[s.id] || "OEM",
    inStock: true,
    deliveryLabel: s.deliveryLabel,
    deliveryDays: s.avgDeliveryDays,
    warranty: warranties[s.id] || "12 months",
  }));
}

const IMAGE_URLS: Record<string, string> = {
  Brakes: "https://placehold.co/200x160/fef2f2/991b1b?text=Brake+Part",
  Filters: "https://placehold.co/200x160/f0fdf4/166534?text=Filter",
  Ignition: "https://placehold.co/200x160/fffbeb/92400e?text=Ignition+Part",
  Electrical: "https://placehold.co/200x160/eff6ff/1e40af?text=Electrical+Part",
  Cooling: "https://placehold.co/200x160/ecfeff/155e75?text=Cooling+Part",
  Lighting: "https://placehold.co/200x160/fefce8/713f12?text=Lighting+Part",
  Suspension: "https://placehold.co/200x160/f5f3ff/4c1d95?text=Suspension+Part",
};

const PLACEHOLDER_VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

export const PARTS_CATALOG: Part[] = [
  // ─── BRAKES ───
  {
    id: "brake-pad-front",
    category: "Brakes",
    name: "Front Brake Pad Set",
    partNumber: "CBP-7301",
    fitment: allFitment,
    basePrice: 38.0,
    imageUrl: IMAGE_URLS.Brakes,
    videoUrl: "https://www.youtube.com/watch?v=3P5v0BjfnBk",
    suppliers: buildSuppliers(
      38.0,
      { "metro-parts": "ACDelco", "national-auto": "Bosch", proparts: "Power Stop", valueparts: "Wagner", automarket: "EBC", directbrand: "Brembo" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "brake-pad-rear",
    category: "Brakes",
    name: "Rear Brake Pad Set",
    partNumber: "CBP-7302",
    fitment: allFitment,
    basePrice: 32.0,
    imageUrl: IMAGE_URLS.Brakes,
    videoUrl: "https://www.youtube.com/watch?v=3P5v0BjfnBk",
    suppliers: buildSuppliers(
      32.0,
      { "metro-parts": "ACDelco", "national-auto": "Bosch", proparts: "Wagner", valueparts: "Power Stop", automarket: "EBC", directbrand: "Brembo" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "rotor-front",
    category: "Brakes",
    name: "Front Rotor",
    partNumber: "CRF-7401",
    fitment: allFitment,
    basePrice: 45.0,
    imageUrl: IMAGE_URLS.Brakes,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      45.0,
      { "metro-parts": "ACDelco", "national-auto": "Bosch", proparts: "Power Stop", valueparts: "Wagner", automarket: "EBC", directbrand: "Brembo" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "rotor-rear",
    category: "Brakes",
    name: "Rear Rotor",
    partNumber: "CRR-7402",
    fitment: allFitment,
    basePrice: 38.0,
    imageUrl: IMAGE_URLS.Brakes,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      38.0,
      { "metro-parts": "Bosch", "national-auto": "ACDelco", proparts: "Power Stop", valueparts: "Wagner", automarket: "EBC", directbrand: "Brembo" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "brake-caliper",
    category: "Brakes",
    name: "Brake Caliper",
    partNumber: "CBC-7501",
    fitment: allFitment,
    basePrice: 65.0,
    imageUrl: IMAGE_URLS.Brakes,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      65.0,
      { "metro-parts": "ACDelco", "national-auto": "Bosch", proparts: "Power Stop", valueparts: "Wagner", automarket: "EBC", directbrand: "Brembo" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  // ─── BRAKES (European) ───
  {
    id: "brake-pad-front-euro",
    category: "Brakes",
    name: "Front Brake Pad Set (European)",
    partNumber: "CBP-7301E",
    fitment: europeanFitment,
    basePrice: 38.0,
    imageUrl: IMAGE_URLS.Brakes,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      38.0,
      { "metro-parts": "Brembo", "national-auto": "Bosch", proparts: "EBC", valueparts: "Wagner", automarket: "EBC", directbrand: "Brembo" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" },
      true
    ),
  },

  // ─── FILTERS ───
  {
    id: "oil-filter",
    category: "Filters",
    name: "Oil Filter",
    partNumber: "COF-8101",
    fitment: allFitment,
    basePrice: 8.0,
    imageUrl: IMAGE_URLS.Filters,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      8.0,
      { "metro-parts": "Fram", "national-auto": "Wix", proparts: "Bosch", valueparts: "Fram", automarket: "Mann", directbrand: "Denso" },
      { "metro-parts": "12 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },
  {
    id: "air-filter",
    category: "Filters",
    name: "Air Filter",
    partNumber: "CAF-8201",
    fitment: allFitment,
    basePrice: 18.0,
    imageUrl: IMAGE_URLS.Filters,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      18.0,
      { "metro-parts": "K&N", "national-auto": "Fram", proparts: "Bosch", valueparts: "Wix", automarket: "Mann", directbrand: "Denso" },
      { "metro-parts": "24 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },
  {
    id: "cabin-air-filter",
    category: "Filters",
    name: "Cabin Air Filter",
    partNumber: "CCF-8301",
    fitment: allFitment,
    basePrice: 22.0,
    imageUrl: IMAGE_URLS.Filters,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      22.0,
      { "metro-parts": "Fram", "national-auto": "K&N", proparts: "Denso", valueparts: "Wix", automarket: "Bosch", directbrand: "Mann" },
      { "metro-parts": "12 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },
  {
    id: "fuel-filter",
    category: "Filters",
    name: "Fuel Filter",
    partNumber: "CFF-8401",
    fitment: commonFitment,
    basePrice: 28.0,
    imageUrl: IMAGE_URLS.Filters,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      28.0,
      { "metro-parts": "Bosch", "national-auto": "Fram", proparts: "Wix", valueparts: "Mann", automarket: "Denso", directbrand: "K&N" },
      { "metro-parts": "12 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },

  // ─── IGNITION ───
  {
    id: "spark-plug-set",
    category: "Ignition",
    name: "Spark Plug Set",
    partNumber: "CSP-9101",
    fitment: allFitment,
    basePrice: 28.0,
    imageUrl: IMAGE_URLS.Ignition,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      28.0,
      { "metro-parts": "NGK", "national-auto": "Denso", proparts: "Bosch", valueparts: "Champion", automarket: "ACDelco", directbrand: "NGK" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "ignition-coil",
    category: "Ignition",
    name: "Ignition Coil",
    partNumber: "CIC-9201",
    fitment: allFitment,
    basePrice: 55.0,
    imageUrl: IMAGE_URLS.Ignition,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      55.0,
      { "metro-parts": "Denso", "national-auto": "Bosch", proparts: "NGK", valueparts: "ACDelco", automarket: "Champion", directbrand: "Denso" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "distributor-cap",
    category: "Ignition",
    name: "Distributor Cap",
    partNumber: "CDC-9301",
    fitment: commonFitment,
    basePrice: 32.0,
    imageUrl: IMAGE_URLS.Ignition,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      32.0,
      { "metro-parts": "ACDelco", "national-auto": "Bosch", proparts: "NGK", valueparts: "Denso", automarket: "Champion", directbrand: "Bosch" },
      { "metro-parts": "24 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },

  // ─── ELECTRICAL ───
  {
    id: "alternator",
    category: "Electrical",
    name: "Alternator",
    partNumber: "CAL-1001",
    fitment: [
      { make: "Toyota", model: "Camry", years: yearRange },
      { make: "Honda", model: "Accord", years: yearRange },
      { make: "Ford", model: "F-150", years: yearRange },
      { make: "Chevrolet", model: "Silverado", years: yearRange },
    ],
    basePrice: 120.0,
    imageUrl: IMAGE_URLS.Electrical,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      120.0,
      { "metro-parts": "Bosch", "national-auto": "Denso", proparts: "Remy", valueparts: "WAI", automarket: "DB Electrical", directbrand: "Denso" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "starter-motor",
    category: "Electrical",
    name: "Starter Motor",
    partNumber: "CSM-1101",
    fitment: [
      { make: "Toyota", model: "RAV4", years: yearRange },
      { make: "Honda", model: "CR-V", years: yearRange },
      { make: "Ford", model: "Escape", years: yearRange },
    ],
    basePrice: 145.0,
    imageUrl: IMAGE_URLS.Electrical,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      145.0,
      { "metro-parts": "Denso", "national-auto": "Bosch", proparts: "Remy", valueparts: "WAI", automarket: "DB Electrical", directbrand: "Bosch" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "battery",
    category: "Electrical",
    name: "Battery",
    partNumber: "CBT-1201",
    fitment: allFitment,
    basePrice: 95.0,
    imageUrl: IMAGE_URLS.Electrical,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      95.0,
      { "metro-parts": "Bosch", "national-auto": "ACDelco", proparts: "Denso", valueparts: "WAI", automarket: "DB Electrical", directbrand: "Bosch" },
      { "metro-parts": "36 months", "national-auto": "36 months", proparts: "24 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "oxygen-sensor",
    category: "Electrical",
    name: "Oxygen Sensor",
    partNumber: "COS-1301",
    fitment: allFitment,
    basePrice: 48.0,
    imageUrl: IMAGE_URLS.Electrical,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      48.0,
      { "metro-parts": "Denso", "national-auto": "Bosch", proparts: "WAI", valueparts: "Denso", automarket: "DB Electrical", directbrand: "Bosch" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },

  // ─── COOLING ───
  {
    id: "water-pump",
    category: "Cooling",
    name: "Water Pump",
    partNumber: "CWP-2101",
    fitment: allFitment,
    basePrice: 85.0,
    imageUrl: IMAGE_URLS.Cooling,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      85.0,
      { "metro-parts": "Gates", "national-auto": "ACDelco", proparts: "Dayco", valueparts: "Dorman", automarket: "Mishimoto", directbrand: "Gates" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "thermostat",
    category: "Cooling",
    name: "Thermostat",
    partNumber: "CTH-2201",
    fitment: allFitment,
    basePrice: 22.0,
    imageUrl: IMAGE_URLS.Cooling,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      22.0,
      { "metro-parts": "Gates", "national-auto": "Dorman", proparts: "ACDelco", valueparts: "Dayco", automarket: "Dorman", directbrand: "Gates" },
      { "metro-parts": "24 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },
  {
    id: "radiator",
    category: "Cooling",
    name: "Radiator",
    partNumber: "CRD-2301",
    fitment: allFitment,
    basePrice: 180.0,
    imageUrl: IMAGE_URLS.Cooling,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      180.0,
      { "metro-parts": "Mishimoto", "national-auto": "Dorman", proparts: "Gates", valueparts: "Dorman", automarket: "Dayco", directbrand: "Mishimoto" },
      { "metro-parts": "36 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "coolant-reservoir",
    category: "Cooling",
    name: "Coolant Reservoir",
    partNumber: "CCR-2401",
    fitment: commonFitment,
    basePrice: 38.0,
    imageUrl: IMAGE_URLS.Cooling,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      38.0,
      { "metro-parts": "Dorman", "national-auto": "ACDelco", proparts: "Gates", valueparts: "Dorman", automarket: "Dayco", directbrand: "ACDelco" },
      { "metro-parts": "24 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },

  // ─── LIGHTING ───
  {
    id: "h7-headlight",
    category: "Lighting",
    name: "H7 Headlight Bulb",
    partNumber: "CLH-3101",
    fitment: allFitment,
    basePrice: 18.0,
    imageUrl: IMAGE_URLS.Lighting,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      18.0,
      { "metro-parts": "Sylvania", "national-auto": "Philips", proparts: "Osram", valueparts: "GE", automarket: "Hella", directbrand: "Philips" },
      { "metro-parts": "12 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },
  {
    id: "h11-fog-light",
    category: "Lighting",
    name: "H11 Fog Light Bulb",
    partNumber: "CLF-3201",
    fitment: allFitment,
    basePrice: 15.0,
    imageUrl: IMAGE_URLS.Lighting,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      15.0,
      { "metro-parts": "Philips", "national-auto": "Sylvania", proparts: "Hella", valueparts: "GE", automarket: "Osram", directbrand: "Sylvania" },
      { "metro-parts": "12 months", "national-auto": "12 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "24 months" }
    ),
  },
  {
    id: "led-fog-light-kit",
    category: "Lighting",
    name: "LED Fog Light Kit",
    partNumber: "CLK-3301",
    fitment: commonFitment,
    basePrice: 45.0,
    imageUrl: IMAGE_URLS.Lighting,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      45.0,
      { "metro-parts": "Hella", "national-auto": "Philips", proparts: "Osram", valueparts: "Sylvania", automarket: "GE", directbrand: "Hella" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },

  // ─── SUSPENSION ───
  {
    id: "sway-bar-link",
    category: "Suspension",
    name: "Sway Bar Link",
    partNumber: "CSB-4101",
    fitment: allFitment,
    basePrice: 22.0,
    imageUrl: IMAGE_URLS.Suspension,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      22.0,
      { "metro-parts": "Moog", "national-auto": "Monroe", proparts: "TRW", valueparts: "Dorman", automarket: "KYB", directbrand: "Moog" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "control-arm",
    category: "Suspension",
    name: "Control Arm",
    partNumber: "CCA-4201",
    fitment: allFitment,
    basePrice: 95.0,
    imageUrl: IMAGE_URLS.Suspension,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      95.0,
      { "metro-parts": "Moog", "national-auto": "TRW", proparts: "Dorman", valueparts: "Monroe", automarket: "KYB", directbrand: "Moog" },
      { "metro-parts": "36 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "strut-assembly",
    category: "Suspension",
    name: "Strut Assembly",
    partNumber: "CSA-4301",
    fitment: allFitment,
    basePrice: 145.0,
    imageUrl: IMAGE_URLS.Suspension,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      145.0,
      { "metro-parts": "Monroe", "national-auto": "KYB", proparts: "Moog", valueparts: "Monroe", automarket: "Dorman", directbrand: "KYB" },
      { "metro-parts": "36 months", "national-auto": "36 months", proparts: "24 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
  {
    id: "tie-rod-end",
    category: "Suspension",
    name: "Tie Rod End",
    partNumber: "CTR-4401",
    fitment: allFitment,
    basePrice: 42.0,
    imageUrl: IMAGE_URLS.Suspension,
    videoUrl: PLACEHOLDER_VIDEO,
    suppliers: buildSuppliers(
      42.0,
      { "metro-parts": "Moog", "national-auto": "TRW", proparts: "Dorman", valueparts: "Monroe", automarket: "KYB", directbrand: "TRW" },
      { "metro-parts": "24 months", "national-auto": "24 months", proparts: "12 months", valueparts: "12 months", automarket: "12 months", directbrand: "36 months" }
    ),
  },
];

export function getPartsForVehicle(
  make: string,
  model: string,
  year: number
): Part[] {
  return PARTS_CATALOG.filter((part) =>
    part.fitment.some(
      (f) => f.make === make && f.model === model && f.years.includes(year)
    )
  );
}

export function getCategories(parts: Part[]): string[] {
  return [...new Set(parts.map((p) => p.category))];
}

export function getPartsByCategory(parts: Part[], category: string): Part[] {
  return parts.filter((p) => p.category === category);
}
