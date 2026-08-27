import { describe, expect, it } from 'vitest';
import { nextThemePreference, parseThemePreference } from '../../src/web/theme.js';

describe('theme preference', () => {
  it('falls back to the system theme for missing or invalid preferences', () => {
    expect(parseThemePreference(null)).toBe('auto');
    expect(parseThemePreference('unknown')).toBe('auto');
  });

  it('cycles through system, light, and dark themes', () => {
    expect(nextThemePreference('auto')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('auto');
  });
});
