export type PicklistFilterOption = { value: string; label: string };

/** Sorted, deduped select options from settings/API string lists. */
export function picklistToFilterOptions(values: string[]): PicklistFilterOption[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const t = raw.trim();
    if (t) seen.add(t);
  }
  return [...seen]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}
