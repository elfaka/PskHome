"use client";

import { useTheme } from "./useTheme";
import { THEME_PREFERENCES, ThemePreference } from "./theme";

const LABEL: Record<ThemePreference, string> = {
  system: "시스템 설정",
  light: "라이트 모드",
  dark: "다크 모드",
};

function Icon({ preference }: { preference: ThemePreference }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (preference === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
    );
  }

  if (preference === "dark") {
    return (
      <svg {...common}>
        <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </svg>
  );
}

/**
 * 테마 순환 버튼 — system → light → dark → system.
 *
 * 마운트 전에는 저장된 취향을 모른다. 아이콘을 아무거나 그리면 hydration 직후
 * 바뀌면서 깜빡이므로, 그동안은 같은 크기의 빈 자리만 잡아둔다(레이아웃 시프트 방지).
 */
export default function ThemeToggle() {
  const { preference, mounted, setPreference } = useTheme();

  const next =
    THEME_PREFERENCES[
      (THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length
    ];

  const base =
    "inline-flex size-9 items-center justify-center rounded-control border border-line text-fg-muted transition";

  if (!mounted) {
    return <div className={base} aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      className={`${base} hover:border-line-strong hover:bg-surface-hover hover:text-fg`}
      title={`테마: ${LABEL[preference]} (클릭하면 ${LABEL[next]})`}
      aria-label={`테마 변경 — 현재 ${LABEL[preference]}`}
    >
      <Icon preference={preference} />
    </button>
  );
}
