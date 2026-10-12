export function guestTicker(siteName: string): string {
  return `WELCOME TO ${siteName.toUpperCase()} · PICK A BAY · SIGN IN FOR MORE`;
}

export function emptyTicker(siteName: string): string {
  return `NO APPS YET · ${siteName.toUpperCase()} IS READY`;
}

export function openingTicker(siteName: string, bays: number): string {
  return bays === 0 ? emptyTicker(siteName) : guestTicker(siteName);
}
