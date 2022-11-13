module.exports = {
  env: {
    es2021: true,
    node: true,
  },

  extends: ['airbnb-base', 'plugin:import/typescript', 'prettier'],

  parser: '@typescript-eslint/parser',

  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },

  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },

    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },

  plugins: ['@typescript-eslint', 'jest'],

  rules: {
    'no-console': 0,
    'no-use-before-define': 0,
    'comma-dangle': 0,

    'wrap-iife': ['error', 'inside'],

    'import/extensions': [
      'error',
      'ignorePackages',
      {
        ts: 'never',
        tsx: 'never',
        mts: 'never',
        cts: 'never',
      },
    ],

    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
    ],

    'import/prefer-default-export': 0,

    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',

    'no-underscore-dangle': 0,
    'no-useless-escape': 0,

    'import/order': 0,
    'import/no-named-default': 0,

    'no-unused-expressions': ['error', { allowShortCircuit: true }],

    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': ['error'],

    'lines-between-class-members': 'off',
    'class-methods-use-this': 'off',

    'consistent-return': 'warn',
    'no-param-reassign': ['error', { props: false }],

    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          'test/**/*.ts',
          'tests/**/*.ts',
          'src/lib/**/test.ts',
          'jest.config.ts',
        ],
      },
    ],

    'no-return-await': 'off',
  },
};
