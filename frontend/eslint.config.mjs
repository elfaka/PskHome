import js from "@eslint/js";
import next from "eslint-config-next/core-web-vitals";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next", "node_modules", "next-env.d.ts", "public"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      /**
       * 로고/아이콘 같은 고정 크기 정적 이미지는 next/image 의 최적화 이득이 없고
       * 기존 마크업과 동작을 그대로 유지하는 편이 낫다.
       */
      "@next/next/no-img-element": "off",

      /**
       * eslint-plugin-react-hooks 7 에서 새로 들어온 규칙.
       * 기존 화면들은 "마운트 시 fetch → setState" 패턴으로 작성돼 있어 전부 걸린다.
       * 프레임워크 이관 범위를 넘는 데이터 로딩 구조 개편이라 지금은 경고로 두고,
       * 화면을 손볼 때 하나씩 정리한다.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  }
);
