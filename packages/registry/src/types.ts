export type Access = "public" | "visitor" | "owner";
export type Shape = "tall" | "wide";

export type Route =
  | { kind: "subdomain"; key: string; binding: string }
  | { kind: "proxy"; key: string; binding: string; host: string }
  | { kind: "none" };

export interface Target {
  key: string;
  binding: string;
  host: string;
}

export interface ApexTarget extends Target {
  resolve: string;
  fileSlugPrefix: string | null;
}

export interface Binding {
  binding: string;
  service: string;
}

export interface Tool {
  key: string;
  label: string;
  noun: string;
  origin: string;
}

export interface BayView {
  code: string;
  product: string;
  chars: number;
  title: string;
  access: Access;
  shape: Shape;
  href: string;
}

export interface PublicView {
  site: { name: string };
  tools: Tool[];
  bays: BayView[];
  footer: { title: string; href: string }[];
}
