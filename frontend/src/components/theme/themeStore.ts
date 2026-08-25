import {
  ResolvedTheme,
  THEME_STORAGE_KEY,
  ThemePreference,
  isThemePreference,
} from "./theme";

/**
 * 테마 상태 저장소.
 *
 * React 상태가 아니라 브라우저(localStorage + `<html data-theme>` + matchMedia)를
 * 진짜 소스로 두고, 컴포넌트는 `useSyncExternalStore` 로 구독만 한다.
 * "마운트 시 localStorage 읽어서 setState" 패턴을 피하려는 의도다 —
 * 그 패턴은 hydration 직후 추가 렌더를 유발하고 깜빡임의 원인이 된다.
 *
 * DOM 반영은 `ThemeScript` 가 첫 페인트 전에 한 번 해두고,
 * 이후 변경은 이 파일이 이어받는다.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 스냅샷은 `"<preference>|<resolved>"` 문자열이다. 서버에서는 아래 상수를 쓴다. */
const SERVER_SNAPSHOT = "server";

const listeners = new Set<() => void>();

let snapshot = SERVER_SNAPSHOT;
let initialized = false;

function systemResolved(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    // 프라이빗 모드 등에서 접근이 막히면 기본값으로 둔다.
    return "system";
  }
}

/** 취향으로부터 실제 테마를 계산해 DOM 에 반영하고 스냅샷을 갱신한다. */
function apply(preference: ThemePreference) {
  const resolved: ResolvedTheme =
    preference === "system" ? systemResolved() : preference;

  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;

  const next = `${preference}|${resolved}`;

  // useSyncExternalStore 는 스냅샷 동일성으로 리렌더를 판단한다.
  // 값이 같으면 문자열을 그대로 둬야 무한 렌더를 피할 수 있다.
  if (next !== snapshot) {
    snapshot = next;
    listeners.forEach((l) => l());
  }
}

function currentPreference(): ThemePreference {
  const [p] = snapshot.split("|");
  return isThemePreference(p) ? p : "system";
}

/** 첫 구독 시 한 번만 — 저장값을 읽고 OS 설정 변경을 구독한다. */
function init() {
  if (initialized) return;
  initialized = true;

  window.matchMedia(DARK_QUERY).addEventListener("change", () => {
    // system 을 고른 사용자만 OS 변경을 따라간다.
    if (currentPreference() === "system") apply("system");
  });

  apply(readStored());
}

export function subscribe(onChange: () => void) {
  init();
  listeners.add(onChange);

  return () => listeners.delete(onChange);
}

export function getSnapshot() {
  return snapshot;
}

export function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function setPreference(next: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // 저장에 실패해도 이번 세션 동안은 적용되어야 한다.
  }

  apply(next);
}

/** 스냅샷 문자열을 해석한다. 서버 스냅샷이면 `mounted: false` 다. */
export function parseSnapshot(value: string) {
  if (value === SERVER_SNAPSHOT) {
    return {
      mounted: false as const,
      preference: "system" as ThemePreference,
      resolved: "light" as ResolvedTheme,
    };
  }

  const [preference, resolved] = value.split("|");

  return {
    mounted: true as const,
    preference: isThemePreference(preference) ? preference : "system",
    resolved: (resolved === "dark" ? "dark" : "light") as ResolvedTheme,
  };
}
