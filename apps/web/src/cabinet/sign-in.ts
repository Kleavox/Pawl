import { silentSignInPath } from "../auth-client";

export function signInHref(
  passOrigin: string,
  place: { origin: string; pathname: string; search: string },
): string {
  const back = new URL(silentSignInPath(place), place.origin).href;
  return `${passOrigin}/?returnTo=${encodeURIComponent(back)}`;
}
