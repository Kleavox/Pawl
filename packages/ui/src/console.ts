const STOP =
  "color: #ff4d5e; font-size: 48px; font-weight: 800; text-shadow: 2px 2px 0 #000000;";

export function greetConsole(
  siteName: string,
  log: (...parts: string[]) => void = (...parts) => console.log(...parts),
): void {
  log("%cSTOP", STOP);
  log(
    `This console is for people who build ${siteName}. If someone asked you to paste something here to unlock a bay or "fix" your account, they are trying to take your account. Close this panel.`,
  );
  log("Looking for the service menu? Real machines answer to 4-2-3-1.");
}
