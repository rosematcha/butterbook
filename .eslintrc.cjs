/** Repo-root ESLint config. Apps/packages may extend or override. */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'butterbook'],
  ignorePatterns: ['node_modules', 'dist', '.next', 'coverage', 'packages/eslint-plugin-butterbook/lib/**'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'butterbook/no-direct-tenant-db': 'error',
  },
  overrides: [
    {
      files: ['apps/api/tests/**/*.ts'],
      rules: {
        'butterbook/no-direct-tenant-db': 'off',
      },
    },
  ],
};
