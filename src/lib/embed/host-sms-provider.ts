/**
 * HostSmsProvider — the ContextProvider implementation for embedded
 * (Shell B) deployments inside a host shop-management system.
 *
 * Context IN:  vehicle + repair-order lines, from the iframe URL params
 *              (or a host `conneverse:context` postMessage handled by
 *              the /embed page before the provider mounts).
 * Lines OUT:   `onQuoteComplete` posts the selected lines back to the
 *              host window as a `conneverse:quote-complete` message.
 *
 * The SourcingPanel itself needs zero changes — that's the point of
 * the ContextProvider seam from Prompt 0.
 */

import type { ContextProvider } from "@/context/SourcingContext";
import type { PartRequest, QuoteLine, Vehicle } from "@/types";

/** One line as the host receives it back. The documented wire shape —
 * see docs/embed.md. */
export type EmbedQuoteLine = {
  description: string;
  brand: string;
  partNumber: string;
  qty: number;
  unitPrice: number;
  warranty: string;
  delivery: string;
  gradeTier: string | null;
  option: "A" | "B";
  attribution: "Fulfilled by Conneverse";
};

export type HostContext = {
  vehicle: Vehicle | null;
  /** The RO line being sourced (one per embed open, matching the
   * per-line "Source with Conneverse" button UX). */
  line: { description: string; partId?: string; qty?: number } | null;
  /** postMessage target origin. Hosts MUST pass their own origin;
   * "*" is tolerated for local demos only. */
  targetOrigin: string;
};

/** Parse host context from the iframe URL. */
export function hostContextFromParams(
  params: URLSearchParams
): HostContext {
  const year = Number(params.get("year"));
  const make = params.get("make") ?? "";
  const model = params.get("model") ?? "";
  const vehicle: Vehicle | null =
    Number.isInteger(year) && year > 1900 && make && model
      ? { year, make, model }
      : null;

  const desc = params.get("desc") ?? params.get("line");
  const line = desc
    ? {
        description: desc,
        partId: params.get("partId") ?? undefined,
        qty: Number(params.get("qty")) || 1,
      }
    : null;

  return {
    vehicle,
    line,
    targetOrigin: params.get("origin") ?? "*",
  };
}

export class HostSmsProvider implements ContextProvider {
  constructor(private ctx: HostContext) {}

  getVehicle(): Vehicle | null {
    return this.ctx.vehicle;
  }

  getPartLines(): PartRequest[] {
    if (!this.ctx.line) return [];
    return [
      {
        partId: this.ctx.line.partId ?? "",
        category: "",
        name: this.ctx.line.description,
      },
    ];
  }

  onQuoteComplete(lines: QuoteLine[]): void {
    if (typeof window === "undefined" || !window.parent) return;
    const payload: EmbedQuoteLine[] = lines.map((l) => ({
      description: l.partName,
      brand: l.brand,
      partNumber: l.partNumber,
      qty: l.qty,
      unitPrice: l.price,
      warranty: l.warranty,
      delivery: l.deliveryLabel,
      gradeTier: l.gradeTier ?? null,
      option: l.option,
      attribution: "Fulfilled by Conneverse",
    }));
    window.parent.postMessage(
      { type: "conneverse:quote-complete", lines: payload },
      this.ctx.targetOrigin
    );
  }

  /** Announce readiness so hosts can sequence context delivery. */
  announceReady(): void {
    if (typeof window === "undefined" || !window.parent) return;
    window.parent.postMessage(
      { type: "conneverse:ready" },
      this.ctx.targetOrigin
    );
  }
}
