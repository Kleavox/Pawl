import "@pawl/ui/theme.css";
import { hydrateRoot } from "react-dom/client";

import { PassPage } from "./PassPage";
import { PASS } from "./site";

hydrateRoot(
  document.getElementById("root")!,
  <PassPage siteName={PASS.siteName} rootOrigin={PASS.rootOrigin} />,
);
