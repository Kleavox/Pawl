import { publicOrigin } from "@pawl/topology";

const EXAMPLE_DOMAIN = "example.com";

export const ROOT_ORIGIN =
  import.meta.env.VITE_ROOT_ORIGIN ?? publicOrigin(EXAMPLE_DOMAIN, "gateway");
export const PASS_ORIGIN =
  import.meta.env.VITE_PASS_ORIGIN ?? publicOrigin(EXAMPLE_DOMAIN, "pass");
