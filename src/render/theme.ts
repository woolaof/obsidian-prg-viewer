export interface RenderTheme {
  background: string;
  text: string;
  border: string;
  edge: string;
  sectionTitle: string;
  isDark: boolean;
}

export const LIGHT_THEME: RenderTheme = {
  background: "#ffffff",
  text: "#1f2328",
  border: "#cccccc",
  edge: "#666666",
  sectionTitle: "#1f2328",
  isDark: false,
};

export const DARK_THEME: RenderTheme = {
  background: "#1e1e1e",
  text: "#ffffff",
  border: "#cccccc",
  edge: "#cccccc",
  sectionTitle: "#ffffff",
  isDark: true,
};

export function themeForDark(isDark: boolean): RenderTheme {
  return isDark ? DARK_THEME : LIGHT_THEME;
}
