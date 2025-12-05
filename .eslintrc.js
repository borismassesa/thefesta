module.exports = {
  root: true,
  extends: [
    "@turbo/eslint-config/base",
    "@turbo/eslint-config/typescript",
    "@turbo/eslint-config/react",
    "@turbo/eslint-config/react-native",
    "prettier"
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-var": "error",
  },
  overrides: [
    {
      files: ["**/*.test.*", "**/*.spec.*"],
      env: {
        jest: true,
      },
    },
  ],
};
