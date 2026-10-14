import "@pawl/ui/theme.css";
import { hydrateRoot } from "react-dom/client";

import { ReceiptPage } from "./receipt/ReceiptPage";
import { PAGE, SITE } from "./site";

const root = document.getElementById("root")!;

hydrateRoot(
  root,
  <ReceiptPage
    site={SITE}
    kind={root.dataset.page === "terms" ? "terms" : "privacy"}
    hosts={{ rootHost: PAGE.rootHost, passHost: PAGE.passHost }}
  />,
);
