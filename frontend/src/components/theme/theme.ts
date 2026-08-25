/**
 * 테마 공용 타입/상수.
 *
 * - `ThemePreference` 는 사용자가 고른 값 (system 포함) — localStorage 에 저장된다.
 * - `ResolvedTheme` 는 실제로 화면에 적용되는 값 — `<html data-theme>` 에 박힌다.
 *
 * 이 파일은 클라이언트 컴포넌트(`ThemeProvider`)와 서버 컴포넌트(`ThemeScript`)가
 * 함께 import 하므로 브라우저 API 를 직접 만지지 않는다.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** localStorage 키. `ThemeScript` 의 인라인 스크립트도 같은 키를 읽는다. */
export const THEME_STORAGE_KEY = "theme";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "system" || v === "light" || v === "dark";
}
