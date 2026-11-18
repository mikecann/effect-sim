// mikecann-lint first: it points typescript-eslint at TypeScript 6 before
// anything else loads it (this app is on TypeScript 7).
import mikecannLint from "mikecann-lint";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { reactRefresh } from "eslint-plugin-react-refresh";
import localRules from "./eslint-rules/index.js";

export default [
  ...(await mikecannLint({
    root: import.meta.dirname,
    ignores: ["ios/**", "public/**", "eslint-rules/**"],
  })),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    name: "effect-sim/app",
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-refresh": reactRefresh.plugin,
      local: localRules,
    },
    rules: {
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
      "no-empty-pattern": "off",
      curly: ["error", "multi"],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": "off",

      "prefer-const": ["error", { destructuring: "all" }],
      "no-var": "error",
      "no-negated-condition": "error",
      "no-extra-boolean-cast": "error",
      "no-unneeded-ternary": "error",

      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-as-const": "error",

      "no-restricted-syntax": [
        "error",
        {
          selector: "SwitchStatement",
          message:
            "Switch statements are not allowed. Use if-else with early returns instead.",
        },
      ],

      "local/no-hoisted-single-use-handlers": "error",
    },
  },
  {
    // Entry points export nothing, so there's nothing for fast refresh to keep.
    name: "effect-sim/entry-points",
    files: ["src/main.tsx", "hardware-interface-runtime/index.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    name: "effect-sim/components",
    files: ["**/*.tsx"],
    ignores: ["**/Houses.tsx"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 250, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
