export function silentSignInPath(place: {
  pathname: string;
  search: string;
}): string {
  const query = new URLSearchParams({
    returnTo: `${place.pathname}${place.search}`,
    prompt: "none",
  });
  return `/auth/signin?${query}`;
}

export async function signOut(): Promise<void> {
  const response = await fetch("/auth/signout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`The pass office answered ${response.status}.`);
  }
  const answer = (await response.json()) as {
    action: string | null;
    fields: Record<string, string>;
  };
  if (!answer.action) {
    window.location.assign("/");
    return;
  }
  const form = document.createElement("form");
  form.method = "post";
  form.action = answer.action;
  for (const [name, value] of Object.entries(answer.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}
