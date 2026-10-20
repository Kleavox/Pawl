import "@pawl/ui/theme.css";
import { greetConsole } from "@pawl/ui";
import { hydrateRoot } from "react-dom/client";

import { CabinetPage } from "./cabinet/CabinetPage";
import { PAGE, SITE } from "./site";

hydrateRoot(
  document.getElementById("root")!,
  <CabinetPage site={SITE} passHref={PAGE.passHref} />,
);
greetConsole(SITE.site.name);
