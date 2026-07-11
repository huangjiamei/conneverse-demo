"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type SourcingMode = "copilot" | "autopilot";

export type ShopProfile = {
  shopName: string;
  address: string;
  phone: string;
  laborRate: number;
  region: string;
  zipCode: string;
  /**
   * Per-category sourcing mode. Copilot (default): the comparison grid
   * is the default results view, machine picks shown as soft tags.
   * Autopilot (earned via the graduation dashboard): the two-pick view
   * is the default — the grid stays one click away.
   */
  sourcingModes?: Record<string, SourcingMode>;
};

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  shopName: "Bay Auto Care",
  address: "847 Harrison St, San Francisco, CA 94107",
  phone: "(415) 555-0187",
  laborRate: 133,
  region: "San Francisco Bay Area",
  zipCode: "94107",
};

const STORAGE_KEY = "conneverse:shopProfile";

type ShopContextValue = {
  profile: ShopProfile | null;
  setProfile: (profile: ShopProfile) => void;
  clearProfile: () => void;
  isLoaded: boolean;
  /** Sourcing mode for a category. Copilot unless explicitly flipped. */
  getSourcingMode: (category: string) => SourcingMode;
  setSourcingMode: (category: string, mode: SourcingMode) => void;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<ShopProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ShopProfile;
        if (parsed && typeof parsed.shopName === "string") {
          setProfileState(parsed);
        }
      }
    } catch {
      // ignore malformed localStorage
    }
    setIsLoaded(true);
  }, []);

  const setProfile = useCallback((next: ShopProfile) => {
    setProfileState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, []);

  const clearProfile = useCallback(() => {
    setProfileState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const getSourcingMode = useCallback(
    (category: string): SourcingMode =>
      profile?.sourcingModes?.[category] ?? "copilot",
    [profile]
  );

  const setSourcingMode = useCallback(
    (category: string, mode: SourcingMode) => {
      setProfileState((current) => {
        if (!current) return current;
        const next: ShopProfile = {
          ...current,
          sourcingModes: { ...current.sourcingModes, [category]: mode },
        };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        return next;
      });
    },
    []
  );

  return (
    <ShopContext.Provider
      value={{
        profile,
        setProfile,
        clearProfile,
        isLoaded,
        getSourcingMode,
        setSourcingMode,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return ctx;
}
