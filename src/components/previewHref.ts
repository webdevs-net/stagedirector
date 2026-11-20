export type PreviewMode = "code-owner" | "developer";

/** Same query string with `as` set (or removed for the owner view); other params are kept. */
export function previewHref(base: string, sp: Record<string, string | string[] | undefined>, mode: PreviewMode): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "as" || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) params.append(k, one);
  }
  if (mode === "developer") params.set("as", "developer");
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ""}#preview-as`;
}

