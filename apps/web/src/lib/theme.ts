export type Theme = "dark" | "light";
const KEY = "easyroster.theme";

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(KEY, t);
}

export function initTheme(): void {
  document.documentElement.setAttribute("data-theme", getTheme());
}
