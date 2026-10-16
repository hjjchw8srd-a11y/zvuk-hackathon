import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

const hooksPlugin = reactHooks.configs ? reactHooks : reactHooks.default;
const refreshPlugin = reactRefresh.configs ? reactRefresh : reactRefresh.default;

export default defineConfig([
  globalIgnores(["dist", "public/vendor/**"]),
  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      hooksPlugin.configs.recommended,
      refreshPlugin.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        AudioController: "readonly",
        VolnaAPI: "readonly",
        qrcode: "readonly",
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
]);
