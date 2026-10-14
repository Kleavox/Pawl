import type { PublicView } from "@pawl/registry";
import { renderToString } from "react-dom/server";

import { CabinetPage } from "./cabinet/CabinetPage";
import { ReceiptPage } from "./receipt/ReceiptPage";
import { PAGE, SITE } from "./site";

export type PageName = "cabinet" | "privacy" | "terms";

export type PageFacts = {
  passHref: string;
  rootHost: string;
  passHost: string;
};

export function renderPage(
  page: PageName,
  site: PublicView,
  facts: PageFacts,
): string {
  if (page === "cabinet") {
    return renderToString(
      <CabinetPage site={site} passHref={facts.passHref} />,
    );
  }
  return renderToString(
    <ReceiptPage
      site={site}
      kind={page}
      hosts={{ rootHost: facts.rootHost, passHost: facts.passHost }}
    />,
  );
}

export function render(page: string): string {
  if (page !== "cabinet" && page !== "privacy" && page !== "terms") {
    throw new Error(`There is no page called ${page}.`);
  }
  return renderPage(page, SITE, PAGE);
}
