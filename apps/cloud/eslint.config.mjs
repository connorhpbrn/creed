import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-preview/**",
    ".next-runtime*/**",
    ".next-*.nosync/**",
    "out/**",
    "build/**",
    "supabase/.temp/**",
    "next-env.d.ts",
  ]),
  {
    // A leading underscore explicitly marks an intentionally unused binding.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // These experimental rules reject Creed's intentional imperative ref
      // handles and effects that synchronize external state into React.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
