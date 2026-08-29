export const THEME_STORAGE_KEY = "takotrace-theme";

export const THEME_PREFERENCES = ["auto", "light", "dark"] as const;

export type ThemePreference = typeof THEME_PREFERENCES[number];

export function parseThemePreference(value: string | null): ThemePreference {
  return THEME_PREFERENCES.find((theme) => theme === value) ?? "auto";
}

export function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function nextThemePreference(theme: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(theme);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}
