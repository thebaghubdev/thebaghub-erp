/** Matches backend authentication metric shape (camelCase from API). */
export type AuthenticationMetricApi = {
  id: string;
  category: string;
  metricCategory: string;
  metric: string;
  description: string | null;
  isCustom: boolean;
  brand: string | null;
  model: string | null;
};

/**
 * Default metrics (`isCustom === false`): same item category as the metric row.
 * Custom metrics: same brand+model when both set; brand-only when metric model is null;
 * category-only when metric brand and model are both null.
 */
export function filterMetricsForItem(
  metrics: AuthenticationMetricApi[],
  itemCategory: string,
  itemBrand: string,
  itemModel: string,
): AuthenticationMetricApi[] {
  const ic = itemCategory.trim();
  const ib = itemBrand.trim();
  const im = itemModel.trim();

  return metrics.filter((m) => {
    if (!m.isCustom) {
      return m.category.trim() === ic;
    }
    const mb = (m.brand ?? "").trim();
    const mm = (m.model ?? "").trim();

    if (mb === "" && mm === "") {
      return m.category.trim() === ic;
    }
    if (mb !== "" && mm === "") {
      return mb === ib;
    }
    return mb === ib && mm === im;
  });
}

export function sortMetricsForDisplay(
  metrics: AuthenticationMetricApi[],
): AuthenticationMetricApi[] {
  return [...metrics].sort((a, b) => {
    const c = a.metricCategory.localeCompare(b.metricCategory);
    if (c !== 0) return c;
    return a.metric.localeCompare(b.metric);
  });
}

/** Preserves metric-category order as in the sorted input (first occurrence). */
export function groupMetricsByMetricCategory(
  metrics: AuthenticationMetricApi[],
): { metricCategory: string; metrics: AuthenticationMetricApi[] }[] {
  const order: string[] = [];
  const map = new Map<string, AuthenticationMetricApi[]>();
  for (const m of metrics) {
    const label = m.metricCategory.trim() || "—";
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(m);
  }
  return order.map((metricCategory) => ({
    metricCategory,
    metrics: map.get(metricCategory)!,
  }));
}
