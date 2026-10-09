export interface ErrorPageOptions {
  code?: string;
  service?: string;
  title?: string;
  message?: string;
  accent?: string;
  homeHref?: string;
  homeLabel?: string;
}

const DEFAULT_ACCENT = "#a3e635";

const GENERIC_COPY = {
  title: "Something went wrong",
  message: "An unexpected error occurred.",
};

const ERROR_CODE_COPY: Record<string, { title: string; message: string }> = {
  "400": {
    title: "Bad request",
    message:
      "The request could not be understood. Check the address and retry.",
  },
  "401": {
    title: "Sign in required",
    message: "You need to sign in to access this page.",
  },
  "403": {
    title: "Access denied",
    message: "You don't have permission to view this page.",
  },
  "404": {
    title: "Page not found",
    message: "This page doesn't exist, or it has moved or expired.",
  },
  "410": {
    title: "Gone",
    message: "This resource is no longer available.",
  },
  "429": {
    title: "Too many requests",
    message: "Slow down and try again in a moment.",
  },
  "500": {
    title: "Something broke",
    message:
      "Something went wrong on our side. Give it a moment and try again.",
  },
  "503": {
    title: "Service unavailable",
    message: "This service is temporarily unavailable. Try again shortly.",
  },
};

export function errorCodeCopy(code?: string): {
  title: string;
  message: string;
} {
  return (code && ERROR_CODE_COPY[code]) || GENERIC_COPY;
}

export function renderErrorPage(options: ErrorPageOptions): string {
  const accent = options.accent ?? DEFAULT_ACCENT;
  const homeHref = escapeHtml(options.homeHref ?? "/");
  const homeLabel = escapeHtml(options.homeLabel ?? "Return to Pawl");
  const fallback = errorCodeCopy(options.code);
  const service = escapeHtml(options.service ?? "Pawl");
  const title = escapeHtml(options.title ?? fallback.title);
  const message = escapeHtml(options.message ?? fallback.message);
  const wordmark = `PA<span>WL</span>`;
  const code = options.code
    ? `<div class="pw-error-code" data-code="${escapeHtml(options.code)}">${escapeHtml(options.code)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} | Pawl</title>
<style>
:root{--pw-base:#070908;--pw-surface:#0e1210;--pw-line:#222b26;--pw-ink:#eff5f0;--pw-muted:#84938a;--pw-quiet:#4d5952;--pw-accent:${accent};--pw-mono:"Cascadia Code","SFMono-Regular",Consolas,monospace;--pw-font:"Aptos","Segoe UI Variable","Segoe UI",system-ui,sans-serif;--pw-shell:min(1180px,calc(100vw - 44px))}
*{box-sizing:border-box}
body{margin:0;color:var(--pw-ink);font-family:var(--pw-font);background:radial-gradient(circle at 16% 12%,${hexToGlow(accent)},transparent 26rem),var(--pw-base)}
a{color:inherit;text-decoration:none}
.pw-error{min-height:100dvh;display:flex;flex-direction:column}
.pw-header{display:flex;align-items:center;min-height:72px;padding:0 clamp(20px,4vw,40px);border-bottom:1px solid var(--pw-line)}
.pw-brand{font-family:var(--pw-mono);font-size:0.78rem;font-weight:800;letter-spacing:0.12em}
.pw-brand span{color:var(--pw-accent)}
.pw-error-body{flex:1;width:var(--pw-shell);margin-inline:auto;display:flex;flex-direction:column;justify-content:center;padding-block:clamp(2.5rem,7vw,5rem)}
.pw-error-kicker{margin-bottom:16px;color:var(--pw-accent);font-family:var(--pw-mono);font-size:0.66rem;font-weight:700;letter-spacing:0.16em;text-transform:uppercase}
.pw-error-code{position:relative;display:block;margin:0 0 4px;font-family:var(--pw-mono);font-size:clamp(4.5rem,20vw,10rem);font-weight:800;line-height:0.9;letter-spacing:-0.05em;color:var(--pw-ink);text-shadow:0 0 26px rgb(61 219 224 / 16%);animation:pw-flicker 6s linear infinite}
.pw-error-code::before,.pw-error-code::after{content:attr(data-code);position:absolute;top:0;left:0;width:100%}
.pw-error-code::before{color:#ff3b6b;transform:translateX(-2px);animation:pw-glitch-a 2.4s steps(2,end) infinite alternate-reverse}
.pw-error-code::after{color:#3ddbe0;transform:translateX(2px);animation:pw-glitch-b 3.1s steps(2,end) infinite alternate-reverse}
.pw-error-title{margin:0;font-size:clamp(2rem,6vw,3rem);font-weight:850;letter-spacing:-0.045em;line-height:1.02;text-transform:uppercase}
.pw-error-message{max-width:42rem;margin:18px 0 0;color:var(--pw-muted);font-size:0.95rem;line-height:1.7;overflow-wrap:anywhere}
.pw-error-action{align-self:flex-start;margin-top:28px;border:1px solid var(--pw-line);padding:12px 18px;font-family:var(--pw-mono);font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase}
.pw-error-action:hover{border-color:var(--pw-accent);color:var(--pw-accent)}
.pw-footer{padding:2rem 0;border-top:1px solid var(--pw-line);background:var(--pw-surface)}
.pw-footer-inner{width:var(--pw-shell);margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;padding:0 clamp(20px,4vw,40px)}
.pw-footer-wm{font-weight:700;font-size:0.9rem;letter-spacing:-0.02em}
.pw-footer-wm span{color:var(--pw-accent)}
.pw-footer-copy{color:var(--pw-quiet);font-family:var(--pw-mono);font-size:0.62rem}
@keyframes pw-glitch-a{0%{clip-path:inset(8% 0 86% 0)}20%{clip-path:inset(54% 0 30% 0)}40%{clip-path:inset(74% 0 8% 0)}60%{clip-path:inset(28% 0 56% 0)}80%{clip-path:inset(90% 0 2% 0)}100%{clip-path:inset(42% 0 44% 0)}}
@keyframes pw-glitch-b{0%{clip-path:inset(70% 0 12% 0)}20%{clip-path:inset(16% 0 72% 0)}40%{clip-path:inset(40% 0 38% 0)}60%{clip-path:inset(84% 0 4% 0)}80%{clip-path:inset(22% 0 64% 0)}100%{clip-path:inset(58% 0 24% 0)}}
@keyframes pw-flicker{0%,88%,100%{opacity:1}90%{opacity:0.55}92%{opacity:1}94%{opacity:0.78}96%{opacity:1}}
@media (prefers-reduced-motion:reduce){.pw-error-code{animation:none}.pw-error-code::before,.pw-error-code::after{display:none}}
</style>
</head>
<body>
<div class="pw-error">
<header class="pw-header"><a class="pw-brand" href="${homeHref}">${wordmark}</a></header>
<main class="pw-error-body">
<small class="pw-error-kicker">${service}</small>
${code}
<h1 class="pw-error-title">${title}</h1>
<p class="pw-error-message">${message}</p>
<a class="pw-error-action" href="${homeHref}">${homeLabel} →</a>
</main>
<footer class="pw-footer"><div class="pw-footer-inner"><span class="pw-footer-wm">${wordmark}</span><span class="pw-footer-copy">&copy; ${new Date().getFullYear()} Pawl</span></div></footer>
</div>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hexToGlow(hex: string): string {
  const value = hex.replace("#", "");
  const size = value.length === 3 ? 1 : 2;
  const red = Number.parseInt(value.slice(0, size).repeat(3 - size), 16);
  const green = Number.parseInt(
    value.slice(size, size * 2).repeat(3 - size),
    16,
  );
  const blue = Number.parseInt(
    value.slice(size * 2, size * 3).repeat(3 - size),
    16,
  );
  if ([red, green, blue].some(Number.isNaN)) return "rgb(163 230 53 / 7%)";
  return `rgb(${red} ${green} ${blue} / 7%)`;
}
