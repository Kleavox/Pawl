import { errorMessage } from "@pawl/core";
import { useState } from "react";

export interface Action {
  error: string | null;
  run: (action: () => Promise<void>) => Promise<void>;
  clear: () => void;
}

export function useAction(): Action {
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return { error, run, clear: () => setError(null) };
}
