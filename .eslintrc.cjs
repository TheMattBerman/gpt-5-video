/* eslint-disable */
module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:import/recommended", "prettier"],
  settings: {
    "import/resolver": { typescript: {} }
  },
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "import/order": [
      "warn",
      {
        groups: [["builtin", "external"], ["internal"], ["parent", "sibling", "index"]],
        alphabetize: { order: "asc", caseInsensitive: true }
      }
    ]
  }
};

