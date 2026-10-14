export function guestTicker(siteName: string): string {
  return `WELCOME TO ${siteName.toUpperCase()} · PICK A BAY · SIGN IN FOR MORE`;
}

export function emptyTicker(siteName: string): string {
  return `NO APPS YET · ${siteName.toUpperCase()} IS READY`;
}
