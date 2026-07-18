export type CategoryScore = {
  score: number;
  reviewCount: number;
};

export type Supplier = {
  id: string;
  name: string;
  type: string;
  emoji: string;
  deliveryLabel: string;
  avgDeliveryDays: number;
  returnPolicy: string;
  priceMultiplier: number;
  categoryScores: Record<string, CategoryScore>;
};

export const SUPPLIERS: Supplier[] = [
  {
    id: "metro-parts",
    name: "Metro Parts Direct",
    type: "Local Distributor",
    emoji: "\u{1F3EA}",
    deliveryLabel: "In stock \u2014 delivery in 1-2 hours",
    avgDeliveryDays: 0,
    returnPolicy: "30 days, pickup included",
    priceMultiplier: 1.8,
    categoryScores: {
      Brakes: { score: 4.8, reviewCount: 1420 },
      Filters: { score: 4.6, reviewCount: 890 },
      Ignition: { score: 4.7, reviewCount: 1100 },
      Electrical: { score: 4.3, reviewCount: 650 },
      Cooling: { score: 4.5, reviewCount: 820 },
      Lighting: { score: 4.4, reviewCount: 430 },
      Suspension: { score: 4.7, reviewCount: 980 },
    },
  },
  {
    id: "national-auto",
    name: "National Auto Supply",
    type: "National Chain",
    emoji: "\u{1F527}",
    deliveryLabel: "Same day by 5 PM",
    avgDeliveryDays: 0.5,
    returnPolicy: "30 days",
    priceMultiplier: 1.5,
    categoryScores: {
      Brakes: { score: 4.5, reviewCount: 2100 },
      Filters: { score: 4.4, reviewCount: 1800 },
      Ignition: { score: 4.4, reviewCount: 1350 },
      Electrical: { score: 4.6, reviewCount: 1900 },
      Cooling: { score: 4.3, reviewCount: 1200 },
      Lighting: { score: 4.5, reviewCount: 1600 },
      Suspension: { score: 4.4, reviewCount: 1400 },
    },
  },
  {
    id: "proparts",
    name: "ProParts Online",
    type: "Pro Marketplace",
    emoji: "\u26A1",
    deliveryLabel: "Next business day",
    avgDeliveryDays: 1,
    returnPolicy: "30 days",
    priceMultiplier: 1.2,
    categoryScores: {
      Brakes: { score: 4.5, reviewCount: 1680 },
      Filters: { score: 4.4, reviewCount: 920 },
      Ignition: { score: 4.2, reviewCount: 800 },
      Electrical: { score: 3.9, reviewCount: 540 },
      Cooling: { score: 4.3, reviewCount: 1100 },
      Lighting: { score: 4.1, reviewCount: 670 },
      Suspension: { score: 4.5, reviewCount: 1850 },
    },
  },
  {
    id: "valueparts",
    name: "ValueParts.com",
    type: "Online Discount",
    emoji: "\u{1F4B0}",
    deliveryLabel: "Ready tomorrow by 10 AM \u2014 Guaranteed",
    avgDeliveryDays: 1,
    returnPolicy: "15 days",
    priceMultiplier: 1.0,
    categoryScores: {
      Brakes: { score: 4.3, reviewCount: 3200 },
      Filters: { score: 4.4, reviewCount: 2800 },
      Ignition: { score: 4.0, reviewCount: 1900 },
      Electrical: { score: 3.8, reviewCount: 2400 },
      Cooling: { score: 4.2, reviewCount: 2100 },
      Lighting: { score: 4.3, reviewCount: 3500 },
      Suspension: { score: 4.1, reviewCount: 2900 },
    },
  },
];
