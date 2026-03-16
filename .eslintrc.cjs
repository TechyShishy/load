module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./packages/*/tsconfig.json', './packages/*/tsconfig.node.json'],
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  settings: {
    react: { version: 'detect' },
  },
  ignorePatterns: ['**/dist/**', 'packages/web/e2e/**'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react/react-in-jsx-scope': 'off',
  },
  overrides: [
    {
      // Web unit tests use `await act(async () => { render(...) })` — a well-known RTL
      // idiom where the async callback is required for the act() Promise overload
      // but contains no internal await. require-await is a false positive here.
      // Scoped to the web package only; game-core tests don't use RTL and benefit
      // from keeping the rule active.
      files: ['packages/web/src/**/*.test.ts', 'packages/web/src/**/*.test.tsx'],
      rules: {
        '@typescript-eslint/require-await': 'off',
      },
    },
  ],
};
