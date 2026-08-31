export type PicklistFilterOption = { value: string; label: string };

export function sortPicklistValues(values: string[]): string[] {
  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

/** Sorted, deduped select options from settings/API string lists. */
export function picklistToFilterOptions(values: string[]): PicklistFilterOption[] {
  const seen = new Set<string>();
  for (const raw of values) {
    const t = raw.trim();
    if (t) seen.add(t);
  }
  return sortPicklistValues([...seen]).map((value) => ({ value, label: value }));
}
