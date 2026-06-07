/** Public surface of the offerings module. */
export type {
  AggregateResult,
  Channel,
  Condition,
  Offering,
  RejectionReason,
  ReliabilityBreakdown,
} from "./types.ts";
export { aggregateOfferings, type AggregateInput } from "./aggregate.ts";
export {
  composeReliability,
  reliabilityFromEbay,
  reliabilityFromSimulated,
  SELLER_CURATION,
} from "./reliability.ts";
export {
  ebayToOfferings,
  simulatedToOfferings,
} from "./adapters.ts";
