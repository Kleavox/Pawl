import { renderToString } from "react-dom/server";

import { PassPage } from "./PassPage";
import { PASS } from "./site";

export function renderShell(site: {
  siteName: string;
  rootOrigin: string;
}): string {
  return renderToString(
    <PassPage siteName={site.siteName} rootOrigin={site.rootOrigin} />,
  );
}

export function render(page: string): string {
  if (page !== "pass") throw new Error(`There is no page called ${page}.`);
  return renderShell(PASS);
}
