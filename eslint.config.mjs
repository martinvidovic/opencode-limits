import typescriptConfig from '@linters/eslint-config-typescript'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  ...typescriptConfig,
  eslintConfigPrettier,
  {
    files: ['prettier.config.mjs', 'src/server.ts', 'src/tui.ts'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },
  {
    files: ['src/core/model.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },
  {
    files: ['src/tui.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
]
