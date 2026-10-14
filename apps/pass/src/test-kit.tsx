import type { Identity } from "@pawl/core";
import { render, type RenderResult } from "@testing-library/react";

import type { PassState } from "./flow";
import { PassPage } from "./PassPage";
import type { OAuthProviders } from "./types";

export function renderPass(
  initial: Partial<PassState>,
  options: { user?: Identity | null; providers?: OAuthProviders } = {},
): RenderResult {
  return render(
    <PassPage
      siteName="Fixture"
      rootOrigin="https://example.test"
      initial={initial}
      user={options.user ?? null}
      providers={options.providers ?? { google: false, github: false }}
    />,
  );
}
