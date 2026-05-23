import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-runtime/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Honour the standard "leading underscore = intentionally unused"
    // convention. Without this override, callsites that destructure or
    // accept a callback param they don't use (e.g. `(_event, session) =>
    // ...`) raise the default unused-vars rule even when the underscore
    // signals intent.
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

      // The React 19 react-hooks plugin ships two experimental rules that
      // are overly strict for legitimate, blessed patterns we use:
      //
      // - `react-hooks/refs` flags any access to a ref object during
      //   render, including the `useImperativeHandle`-style ref exposure
      //   in `useAnimatedIconControls`. Re-architecting every animated
      //   icon as a wrapped component would be a sizeable refactor for
      //   no behavioural gain — the existing hook is the React-blessed
      //   way to expose handles via refs.
      //
      // - `react-hooks/set-state-in-effect` flags effects that call
      //   `setState` synchronously, but that's exactly the right shape
      //   when an effect's job is to synchronise external state (a
      //   Supabase session, a sessionStorage cache hit, etc.) into
      //   React. The flagged sites do so intentionally.
      //
      // The stable rules-of-hooks (`react-hooks/rules-of-hooks`,
      // `react-hooks/exhaustive-deps`) still fire and continue to catch
      // real bugs. Turn these two off so the noise doesn't drown out
      // genuine signal.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
