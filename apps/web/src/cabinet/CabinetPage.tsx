import type { PublicView } from "@pawl/registry";
import type { ReactNode } from "react";

import { CabinetView } from "./CabinetView";
import { useCabinet } from "./useCabinet";

function assign(url: string): void {
  window.location.assign(url);
}

export function CabinetPage(props: {
  site: PublicView;
  passHref: string;
  navigate?: (url: string) => void;
}): ReactNode {
  const cabinet = useCabinet({
    site: props.site,
    passHref: props.passHref,
    navigate: props.navigate ?? assign,
  });
  return (
    <CabinetView
      siteName={props.site.site.name}
      passHref={props.passHref}
      state={cabinet.state}
      model={cabinet.model}
      fault={cabinet.fault}
      said={cabinet.said}
      lcd={cabinet.lcd}
      leaving={cabinet.leaving}
      sound={cabinet.sound}
      delivery={cabinet.delivery}
      copied={cabinet.copied}
      on={cabinet.on}
      refs={cabinet.refs}
      onProductsFocus={cabinet.onProductsFocus}
    />
  );
}
