/**
 * Part taxonomy — the fixed vocabulary the resolution layer maps free
 * text onto. Seeded from the demo catalog's categories plus common
 * collision/mechanical part types the catalog doesn't stock yet.
 *
 * The resolver (deterministic stage and LLM stage alike) may only
 * return `id` values from this list — never invented part types.
 * That's the graceful-miss design: a confident wrong part is the one
 * unforgivable sin, so unknown input maps to "no match", not to a
 * guess outside the taxonomy.
 */

export type PartTaxonomyEntry = {
  /** Stable taxonomy id, snake_case. */
  id: string;
  /** Display label for the confirm UI ("Fender liner"). */
  label: string;
  /** Category grouping (demo categories + "Body / Collision", "Engine / Drivetrain", "Exhaust"). */
  category: string;
  /** Alternate names and shorthand, lowercase. */
  aliases: string[];
  /**
   * Demo catalog part ids for this type, when stocked. Position-keyed
   * where the catalog distinguishes front/rear; `default` otherwise.
   */
  catalogPartIds?: { default?: string; front?: string; rear?: string };
};

/** Mechanic shorthand → position words. Multi-word values allowed. */
export const POSITION_ALIASES: Record<string, string> = {
  frt: "front",
  fr: "front",
  f: "front",
  rr: "rear",
  lf: "left front",
  lr: "left rear",
  rf: "right front",
  lh: "left",
  lt: "left",
  l: "left",
  rh: "right",
  rt: "right",
  up: "upper",
  low: "lower",
  pass: "passenger",
  psgr: "passenger",
  drv: "driver",
  front: "front",
  rear: "rear",
  left: "left",
  right: "right",
  upper: "upper",
  lower: "lower",
  driver: "driver",
  passenger: "passenger",
};

/** Shorthand token expansions applied before matching. */
export const TOKEN_EXPANSIONS: Record<string, string> = {
  asy: "assembly",
  assy: "assembly",
  asm: "assembly",
  serp: "serpentine",
  cat: "catalytic",
  conv: "converter",
  alt: "alternator",
  batt: "battery",
  dist: "distributor",
  o2: "oxygen",
  sens: "sensor",
  filt: "filter",
  hdlt: "headlight",
  hl: "headlight",
  wndshld: "windshield",
  bmpr: "bumper",
  fndr: "fender",
  rad: "radiator",
  thermo: "thermostat",
  susp: "suspension",
  ctrl: "control",
};

/** Tokens too generic to establish a match on their own. */
export const GENERIC_TOKENS = new Set([
  "set",
  "kit",
  "assembly",
  "pair",
  "front",
  "rear",
  "left",
  "right",
  "upper",
  "lower",
  "driver",
  "passenger",
  "side",
  "new",
  "oem",
  "and",
  "the",
  "a",
  "for",
  "with",
]);

export const PART_TAXONOMY: PartTaxonomyEntry[] = [
  // ─── Brakes (catalog-backed) ───
  {
    id: "brake_pad_set",
    label: "Brake pad set",
    category: "Brakes",
    aliases: ["brake pads", "pads", "brake pad", "pad set", "ceramic pads"],
    catalogPartIds: {
      front: "brake-pad-front",
      rear: "brake-pad-rear",
      default: "brake-pad-front",
    },
  },
  {
    id: "brake_rotor",
    label: "Brake rotor",
    category: "Brakes",
    aliases: ["rotor", "rotors", "brake disc", "disc rotor"],
    catalogPartIds: {
      front: "rotor-front",
      rear: "rotor-rear",
      default: "rotor-front",
    },
  },
  {
    id: "brake_caliper",
    label: "Brake caliper",
    category: "Brakes",
    aliases: ["caliper", "calipers"],
    catalogPartIds: { default: "brake-caliper" },
  },
  // ─── Filters (catalog-backed) ───
  {
    id: "oil_filter",
    label: "Oil filter",
    category: "Filters",
    aliases: ["oil filter"],
    catalogPartIds: { default: "oil-filter" },
  },
  {
    id: "air_filter",
    label: "Air filter",
    category: "Filters",
    aliases: ["air filter", "engine air filter"],
    catalogPartIds: { default: "air-filter" },
  },
  {
    id: "cabin_air_filter",
    label: "Cabin air filter",
    category: "Filters",
    aliases: ["cabin filter", "cabin air filter", "pollen filter", "ac filter"],
    catalogPartIds: { default: "cabin-air-filter" },
  },
  {
    id: "fuel_filter",
    label: "Fuel filter",
    category: "Filters",
    aliases: ["fuel filter", "gas filter"],
    catalogPartIds: { default: "fuel-filter" },
  },
  // ─── Ignition (catalog-backed) ───
  {
    id: "spark_plug_set",
    label: "Spark plug set",
    category: "Ignition",
    aliases: ["spark plugs", "plugs", "spark plug"],
    catalogPartIds: { default: "spark-plug-set" },
  },
  {
    id: "ignition_coil",
    label: "Ignition coil",
    category: "Ignition",
    aliases: ["coil", "coil pack", "ignition coil"],
    catalogPartIds: { default: "ignition-coil" },
  },
  {
    id: "distributor_cap",
    label: "Distributor cap",
    category: "Ignition",
    aliases: ["distributor cap", "dist cap"],
    catalogPartIds: { default: "distributor-cap" },
  },
  // ─── Electrical (catalog-backed) ───
  {
    id: "alternator",
    label: "Alternator",
    category: "Electrical",
    aliases: ["alternator"],
    catalogPartIds: { default: "alternator" },
  },
  {
    id: "starter_motor",
    label: "Starter motor",
    category: "Electrical",
    aliases: ["starter", "starter motor"],
    catalogPartIds: { default: "starter-motor" },
  },
  {
    id: "battery",
    label: "Battery",
    category: "Electrical",
    aliases: ["battery", "car battery"],
    catalogPartIds: { default: "battery" },
  },
  {
    id: "oxygen_sensor",
    label: "Oxygen sensor",
    category: "Electrical",
    aliases: ["o2 sensor", "oxygen sensor", "lambda sensor"],
    catalogPartIds: { default: "oxygen-sensor" },
  },
  // ─── Cooling (catalog-backed) ───
  {
    id: "water_pump",
    label: "Water pump",
    category: "Cooling",
    aliases: ["water pump", "coolant pump"],
    catalogPartIds: { default: "water-pump" },
  },
  {
    id: "thermostat",
    label: "Thermostat",
    category: "Cooling",
    aliases: ["thermostat", "tstat", "t-stat"],
    catalogPartIds: { default: "thermostat" },
  },
  {
    id: "radiator",
    label: "Radiator",
    category: "Cooling",
    aliases: ["radiator"],
    catalogPartIds: { default: "radiator" },
  },
  {
    id: "coolant_reservoir",
    label: "Coolant reservoir",
    category: "Cooling",
    aliases: [
      "coolant reservoir",
      "overflow tank",
      "expansion tank",
      "coolant tank",
    ],
    catalogPartIds: { default: "coolant-reservoir" },
  },
  // ─── Lighting (catalog-backed) ───
  {
    id: "headlight_bulb",
    label: "Headlight bulb",
    category: "Lighting",
    aliases: ["headlight bulb", "h7 bulb", "headlamp bulb", "bulb"],
    catalogPartIds: { default: "h7-headlight" },
  },
  {
    id: "fog_light",
    label: "Fog light",
    category: "Lighting",
    aliases: ["fog light", "fog lamp", "h11 bulb", "fog light bulb"],
    catalogPartIds: { default: "h11-fog-light" },
  },
  // ─── Suspension (catalog-backed) ───
  {
    id: "sway_bar_link",
    label: "Sway bar link",
    category: "Suspension",
    aliases: ["sway bar link", "stabilizer link", "stab link", "end link"],
    catalogPartIds: { default: "sway-bar-link" },
  },
  {
    id: "control_arm",
    label: "Control arm",
    category: "Suspension",
    aliases: ["control arm", "a-arm", "wishbone"],
    catalogPartIds: { default: "control-arm" },
  },
  {
    id: "strut_assembly",
    label: "Strut assembly",
    category: "Suspension",
    aliases: [
      "strut",
      "struts",
      "strut assembly",
      "shock",
      "shock absorber",
      "coilover",
    ],
    catalogPartIds: { default: "strut-assembly" },
  },
  {
    id: "tie_rod_end",
    label: "Tie rod end",
    category: "Suspension",
    aliases: ["tie rod", "tie rod end", "outer tie rod", "inner tie rod"],
    catalogPartIds: { default: "tie-rod-end" },
  },
  // ─── Engine / Drivetrain (not in demo catalog yet) ───
  {
    id: "serpentine_belt",
    label: "Serpentine belt",
    category: "Engine / Drivetrain",
    aliases: [
      "serpentine belt",
      "serp belt",
      "drive belt",
      "accessory belt",
      "fan belt",
    ],
  },
  {
    id: "timing_belt",
    label: "Timing belt",
    category: "Engine / Drivetrain",
    aliases: ["timing belt", "timing chain", "cam belt"],
  },
  {
    id: "wheel_hub",
    label: "Wheel hub assembly",
    category: "Engine / Drivetrain",
    aliases: [
      "hub",
      "wheel hub",
      "hub assembly",
      "hub bearing",
      "wheel bearing",
    ],
  },
  {
    id: "cv_axle",
    label: "CV axle",
    category: "Engine / Drivetrain",
    aliases: ["cv axle", "axle", "half shaft", "drive shaft", "cv joint"],
  },
  {
    id: "engine_mount",
    label: "Engine mount",
    category: "Engine / Drivetrain",
    aliases: ["engine mount", "motor mount", "transmission mount"],
  },
  // ─── Exhaust (not in demo catalog yet) ───
  {
    id: "catalytic_converter",
    label: "Catalytic converter",
    category: "Exhaust",
    aliases: ["catalytic converter", "cat converter", "catalytic", "catcon"],
  },
  {
    id: "muffler",
    label: "Muffler",
    category: "Exhaust",
    aliases: ["muffler", "silencer", "exhaust muffler"],
  },
  // ─── Body / Collision (not in demo catalog yet) ───
  {
    id: "fender_liner",
    label: "Fender liner",
    category: "Body / Collision",
    aliases: [
      "fender liner",
      "inner fender",
      "wheel well liner",
      "splash shield",
      "wheelhouse liner",
    ],
  },
  {
    id: "fender",
    label: "Fender",
    category: "Body / Collision",
    aliases: ["fender", "wing"],
  },
  {
    id: "bumper_cover",
    label: "Bumper cover",
    category: "Body / Collision",
    aliases: ["bumper", "bumper cover", "front bumper", "rear bumper"],
  },
  {
    id: "headlight_assembly",
    label: "Headlight assembly",
    category: "Body / Collision",
    aliases: [
      "headlight",
      "headlamp",
      "headlight assembly",
      "headlamp assembly",
    ],
  },
  {
    id: "side_mirror",
    label: "Side mirror",
    category: "Body / Collision",
    aliases: ["mirror", "side mirror", "door mirror", "wing mirror"],
  },
  {
    id: "grille",
    label: "Grille",
    category: "Body / Collision",
    aliases: ["grille", "grill", "front grille"],
  },
];

export function getTaxonomyEntry(id: string): PartTaxonomyEntry | null {
  return PART_TAXONOMY.find((e) => e.id === id) ?? null;
}
