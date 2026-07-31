module.exports = {
  root: true,
  extends: ["eslint:recommended"],
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "**/public/**",
    "coverage/**",
    "output/**",
    "tmp/**",
  ],
  rules: {
    "no-unused-vars": "off",
    "no-debugger": "error",
    "no-duplicate-imports": "error",
    "no-console": ["error", { allow: ["warn", "error"] }],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: {
        "no-dupe-class-members": "off",
        "no-undef": "off",
        "@typescript-eslint/no-dupe-class-members": "error",
      },
    },
    {
      files: ["apps/**/*.ts", "apps/**/*.tsx"],
      plugins: ["react-hooks", "react-refresh"],
      rules: {
        ...require("eslint-plugin-react-hooks").configs.recommended.rules,
        // Keep the demo's established effect timing while still linting hook usage.
        "react-hooks/exhaustive-deps": "off",
        "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      },
    },
    {
      files: ["apps/simple-geo-reconstruct-demo/src/benchmark/**/*.ts"],
      rules: {
        // The benchmark intentionally polls until its explicit idle condition is met.
        "no-constant-condition": "off",
      },
    },
    {
      files: ["packages/polygon-tile-quadtree/src/QuadTreeTileProcesser.ts"],
      rules: {
        // Preserve the legacy diagnostics because runtime behavior must remain unchanged.
        "no-console": "off",
      },
    },
  ],
};
