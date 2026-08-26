export type VipDiscountTier = "Gold" | "Diamond";

export function vipPriceFieldLabel(
  tier: VipDiscountTier | null | undefined,
): string {
  if (tier === "Diamond") return "VIP Diamond price";
  if (tier === "Gold") return "VIP Gold price";
  return "VIP price";
}

export function pickVipPriceForClient(
  vipStatus: string | null | undefined,
  vipGoldPrice: string | null | undefined,
  vipDiamondPrice: string | null | undefined,
): { vipPrice: string | null; vipTier: VipDiscountTier | null } {
  if (vipStatus === "Diamond" && vipDiamondPrice) {
    return { vipPrice: vipDiamondPrice, vipTier: "Diamond" };
  }
  if (vipStatus === "Gold" && vipGoldPrice) {
    return { vipPrice: vipGoldPrice, vipTier: "Gold" };
  }
  return { vipPrice: null, vipTier: null };
}
