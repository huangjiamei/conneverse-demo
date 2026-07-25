"use client";

/**
 * /search 页的选购状态 (纯前端, 不落库, 刷新丢)。
 *
 * 让候选表格 (Select 按钮) 和 QuoteBuilder 侧栏共享同一份状态:
 *   - primary: 主推候选 (1 个)
 *   - alternatives: 备选候选 (0-2 个)
 *   - quantities: 每条候选的数量 (默认 1)
 *   - laborHours / laborRate / taxRate: 报价参数
 *
 * 自动填备选: 选主推时, 若该候选在全部 4 个 preset 下都是 Rank 1
 * (pickInPresets 覆盖所有 preset), 说明它无差别碾压, 就自动把 Rank 2 / Rank 3
 * 填成备选, 方便对比。否则不自动填。
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { type Candidate } from "@/components/CandidateCard";

const ALT_MAX = 2;
const ALL_PRESET_COUNT = 4;

type SourcingContextValue = {
  primary: Candidate | null;
  alternatives: Candidate[];
  quantities: Record<string, number>;
  laborHours: number;
  laborRate: number;
  taxRate: number;

  // 搜索上下文快照 (给 PDF 用): 搜索时写入
  vehicleLabel: string | null;
  partDescription: string | null;

  // 派生
  partsSubtotal: number;
  laborTotal: number;
  tax: number;
  grandTotal: number;
  selectedIds: Set<string>;
  altFull: boolean;

  // actions
  selectAsPrimary: (c: Candidate, siblings: Candidate[]) => void;
  selectAsAlternative: (c: Candidate) => void;
  remove: (id: string) => void;
  updateQuantity: (id: string, qty: number) => void;
  updateLaborHours: (h: number) => void;
  updateLaborRate: (r: number) => void;
  updateTaxRate: (r: number) => void;
  resetSelections: () => void;
  setQuoteContext: (vehicleLabel: string, partDescription: string) => void;
};

const Ctx = createContext<SourcingContextValue | null>(null);

export function useSourcing(): SourcingContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSourcing must be used within <SourcingProvider>");
  return v;
}

export function SourcingProvider({ children }: { children: ReactNode }) {
  const [primary, setPrimary] = useState<Candidate | null>(null);
  const [alternatives, setAlternatives] = useState<Candidate[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [laborHours, setLaborHours] = useState(2);
  const [laborRate, setLaborRate] = useState(133);
  const [taxRate, setTaxRate] = useState(8.75);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [partDescription, setPartDescription] = useState<string | null>(null);

  function setQuoteContext(v: string, p: string) {
    setVehicleLabel(v);
    setPartDescription(p);
  }

  function ensureQty(id: string) {
    setQuantities((q) => (q[id] ? q : { ...q, [id]: 1 }));
  }

  function selectAsPrimary(c: Candidate, siblings: Candidate[]) {
    setPrimary(c);
    ensureQty(c.id);

    // 自动填备选: 仅当该候选在全部 4 个 preset 下都是 Rank 1
    if ((c.pickInPresets?.length ?? 0) >= ALL_PRESET_COUNT) {
      const byRank = (r: number) =>
        siblings.find((s) => s.optimizerRank === r && s.id !== c.id);
      const autos = [byRank(2), byRank(3)].filter(Boolean) as Candidate[];
      const picked = autos.slice(0, ALT_MAX);
      setAlternatives(picked);
      setQuantities((q) => {
        const next = { ...q };
        for (const a of picked) if (!next[a.id]) next[a.id] = 1;
        return next;
      });
    }
  }

  function selectAsAlternative(c: Candidate) {
    setAlternatives((alts) => {
      if (alts.some((a) => a.id === c.id) || alts.length >= ALT_MAX) return alts;
      return [...alts, c];
    });
    ensureQty(c.id);
  }

  function remove(id: string) {
    setPrimary((p) => (p?.id === id ? null : p));
    setAlternatives((alts) => alts.filter((a) => a.id !== id));
    setQuantities((q) => {
      const n = { ...q };
      delete n[id];
      return n;
    });
  }

  function updateQuantity(id: string, qty: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(1, Math.min(99, qty)) }));
  }

  function updateLaborHours(h: number) {
    setLaborHours(Math.max(0, Math.min(40, h)));
  }
  function updateLaborRate(r: number) {
    setLaborRate(Math.max(0, r));
  }
  function updateTaxRate(r: number) {
    setTaxRate(Math.max(0, r));
  }

  function resetSelections() {
    setPrimary(null);
    setAlternatives([]);
    setQuantities({});
  }

  // 派生计算。
  // 注意: subtotal / tax / grandTotal 只算主推 —— 客户只会买一个, 备选是参考,
  // 不同时购买, 所以不参与金额累加。没有主推时 grandTotal = 0 (labor 不单独成单)。
  const selected = [primary, ...alternatives].filter(Boolean) as Candidate[];
  const partsSubtotal = primary
    ? Number(primary.price) * (quantities[primary.id] ?? 1)
    : 0;
  const laborTotal = laborHours * laborRate;
  const tax = partsSubtotal * (taxRate / 100);
  const grandTotal = primary ? partsSubtotal + laborTotal + tax : 0;

  const value: SourcingContextValue = {
    primary,
    alternatives,
    quantities,
    laborHours,
    laborRate,
    taxRate,
    vehicleLabel,
    partDescription,
    partsSubtotal,
    laborTotal,
    tax,
    grandTotal,
    selectedIds: new Set(selected.map((c) => c.id)),
    altFull: alternatives.length >= ALT_MAX,
    selectAsPrimary,
    selectAsAlternative,
    remove,
    updateQuantity,
    updateLaborHours,
    updateLaborRate,
    updateTaxRate,
    resetSelections,
    setQuoteContext,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
