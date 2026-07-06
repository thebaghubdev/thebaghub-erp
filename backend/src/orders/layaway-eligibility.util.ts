export const MIN_LAYAWAY_ITEM_RATING = 9.7;
export const LAYAWAY_INELIGIBLE_CATEGORY = 'Shoes';

export function parseItemRatingValue(
  rating: string | null | undefined,
): number | null {
  const text = rating?.trim();
  if (!text) return null;

  const parenMatch = text.match(/\((\d+(?:\.\d+)?)\)\s*$/);
  if (parenMatch) {
    const value = Number(parenMatch[1]);
    return Number.isFinite(value) ? value : null;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function isLayawayEligibleRating(
  rating: string | null | undefined,
): boolean {
  const value = parseItemRatingValue(rating);
  if (value == null) return true;
  return value > MIN_LAYAWAY_ITEM_RATING;
}

export function isLayawayEligibleCategory(
  category: string | null | undefined,
): boolean {
  const text = category?.trim();
  if (!text) return true;
  return text !== LAYAWAY_INELIGIBLE_CATEGORY;
}

export type LayawayEligibility = {
  allowed: boolean;
  reasons: string[];
};

export function getLayawayEligibility(
  rating: string | null | undefined,
  category: string | null | undefined,
): LayawayEligibility {
  const reasons: string[] = [];

  if (!isLayawayEligibleRating(rating)) {
    reasons.push(
      'Layaway is not available for items with a rating of 9.7 or below.',
    );
  }
  if (!isLayawayEligibleCategory(category)) {
    reasons.push('Layaway is not available for shoes.');
  }

  return { allowed: reasons.length === 0, reasons };
}

export function categoryFromItemSnapshot(
  itemSnapshot: { form?: Record<string, unknown> } | null | undefined,
): string | null {
  const value = itemSnapshot?.form?.category;
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}
