/**
 * LLM part-name normalizer — the resolution layer's gap-filler.
 *
 * Prime directive 2: match number-to-number / token-to-token first; the
 * LLM only fills gaps the deterministic matcher can't resolve, and its
 * output is constrained to the fixed taxonomy (structured output with
 * an enum schema — it cannot invent a part type).
 *
 * Model: claude-haiku-4-5 — this is a latency-sensitive, low-complexity
 * classification call in an interactive search path, exactly the
 * fast-model case. Degrades gracefully: if no API credentials are
 * configured or the call fails, returns null and the caller falls back
 * to guided selection.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PART_TAXONOMY } from "@/data/part-taxonomy";

export type LlmResolution = {
  taxonomyId: string | null;
  position: string | null;
  confidence: number;
};

const POSITIONS = [
  "front", "rear", "left", "right",
  "left front", "right front", "left rear", "right rear",
  "upper", "lower", "driver", "passenger",
] as const;

// Compact taxonomy listing for the system prompt: "id — label (aliases)".
const TAXONOMY_LISTING = PART_TAXONOMY.map(
  (e) => `${e.id} — ${e.label} (${e.aliases.join(", ")})`
).join("\n");

// Stable system prompt (cache_control below). Keep byte-identical across
// requests — volatile content (the shorthand, the vehicle) goes in the
// user turn.
const SYSTEM_PROMPT = `You normalize auto-mechanic shorthand into a fixed part taxonomy.

Mechanics type abbreviated part requests like "RT fender liner", "lf hub asy", "serp belt". Map the request to exactly one taxonomy id from the list below, plus a position when the text indicates one.

Rules:
- Only use taxonomy ids from the list. If the text does not clearly refer to one of them, return "unknown". Never guess: a confident wrong part is worse than no match.
- Position comes only from the text (rt/rh = right, lf = left front, frt = front, etc.). If none is indicated, return "none".
- confidence reflects how sure you are the mapping is what the mechanic meant.

Taxonomy:
${TAXONOMY_LISTING}`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    taxonomyId: {
      type: "string",
      enum: [...PART_TAXONOMY.map((e) => e.id), "unknown"],
      description: "The matched taxonomy id, or 'unknown'.",
    },
    position: {
      type: "string",
      enum: [...POSITIONS, "none"],
      description: "Position indicated by the text, or 'none'.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
  },
  required: ["taxonomyId", "position", "confidence"],
  additionalProperties: false,
} as const;

const CONFIDENCE_VALUE: Record<string, number> = {
  high: 0.9,
  medium: 0.6,
  low: 0.3,
};

let client: Anthropic | null = null;
let clientUnavailable = false;

function getClient(): Anthropic | null {
  if (clientUnavailable) return null;
  if (client) return client;
  try {
    // Resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth
    // login` profile from the environment. Throws when nothing is
    // configured — that's the "no key" deterministic-only mode.
    client = new Anthropic();
    return client;
  } catch {
    clientUnavailable = true;
    return null;
  }
}

/**
 * Ask the LLM to normalize `freeText`. Returns null when the LLM is
 * unavailable or fails for any reason — callers must treat null as
 * "no LLM opinion", not as "no match".
 */
export async function llmResolve(
  freeText: string,
  vehicle: { year: number | string; make: string; model: string }
): Promise<LlmResolution | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Prefix caching: the taxonomy prompt is identical on every
          // call; only the user turn varies.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}\nRequest: ${freeText}`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: OUTPUT_SCHEMA,
        },
      },
    });

    if (response.stop_reason === "refusal") return null;

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock) return null;

    const parsed = JSON.parse(textBlock.text) as {
      taxonomyId: string;
      position: string;
      confidence: string;
    };

    return {
      taxonomyId: parsed.taxonomyId === "unknown" ? null : parsed.taxonomyId,
      position: parsed.position === "none" ? null : parsed.position,
      confidence: CONFIDENCE_VALUE[parsed.confidence] ?? 0.3,
    };
  } catch (err) {
    // Auth, network, or upstream failure — degrade to deterministic-only.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[llm-resolver] falling back to deterministic:", message);
    return null;
  }
}
