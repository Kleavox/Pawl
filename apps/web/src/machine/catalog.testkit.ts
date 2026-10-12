import type { Catalog } from "./state";

export const CATALOG: Catalog = [
  {
    code: "1",
    key: "notes",
    estate: true,
    product: "NOTE",
    chars: 4,
    title: "Notes",
    access: "visitor",
    shape: "tall",
    href: "https://notes.example.test",
  },
  {
    code: "3",
    key: "docs",
    estate: false,
    product: "MANUAL",
    chars: 6,
    title: "Docs",
    access: "public",
    shape: "wide",
    href: "https://docs.example.test",
  },
];
