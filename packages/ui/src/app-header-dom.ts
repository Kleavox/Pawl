import { LINK_ORIGIN, PASS_ORIGIN } from "./origins";
import type { NavCounts } from "./nav-counts";
import { displayFor, nameFor, padClass, severityFor } from "./indicator-view";

const TOOLS = [
  { key: "pass", label: "pawl", origin: PASS_ORIGIN, noun: "devices" },
  { key: "link", label: "link", origin: LINK_ORIGIN, noun: "active routes" },
] as const;

export function renderAppHeader(
  target: HTMLElement,
  options: { product?: string; rootOrigin?: string; counts?: NavCounts | null },
): void {
  const { product, rootOrigin = "/", counts } = options;
  const current = product?.toLowerCase();

  target.className = "pw-header";
  target.replaceChildren();

  const brand = document.createElement("a");
  brand.className = "pw-brand";
  brand.href = rootOrigin;
  brand.append("pawl");
  if (current) {
    const b = document.createElement("b");
    b.textContent = `/${TOOLS.find((tool) => tool.key === current)?.label ?? current}`;
    brand.append(b);
  }
  target.append(brand);

  const nav = document.createElement("nav");
  nav.className = "pw-nav";
  nav.setAttribute("aria-label", "Pawl tools");

  for (const tool of TOOLS) {
    const active = current === tool.key;
    const indicator = counts ? counts.indicators[tool.key] : undefined;
    const display = displayFor(indicator);
    const severity = severityFor(indicator);
    const name = active
      ? tool.label
      : nameFor(tool.label, tool.noun, indicator);

    const link = document.createElement("a");
    link.href = tool.origin;
    link.className = active ? "pw-nav-tool is-active" : "pw-nav-tool";
    if (active) link.setAttribute("aria-current", "page");
    link.setAttribute("aria-label", name);

    const labelSpan = document.createElement("span");
    labelSpan.setAttribute("aria-hidden", "true");
    labelSpan.textContent = tool.label;
    link.append(labelSpan);

    if (!active && display !== null) {
      const countSpan = document.createElement("span");
      countSpan.className = "pw-nav-count";
      countSpan.setAttribute("aria-hidden", "true");
      countSpan.textContent = display;
      link.append(countSpan);
    }

    if (!active && severity !== null) {
      const pad = document.createElement("span");
      pad.className = padClass(severity);
      pad.setAttribute("aria-hidden", "true");
      link.append(pad);
    }

    nav.append(link);
  }

  target.append(nav);
}
