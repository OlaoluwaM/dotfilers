/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testTimeout: 10000,
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[tj]s?(x)'],
  coveragePathIgnorePatterns: [
    '<rootDir>/src/lib/schema-validator.ts',
    '<rootDir>/src/lib/schema-validator-oop.ts',
    '<rootDir>/src/lib/schema-validator-oop/',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/test-setup.ts'],
  transform: {},
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleFileExtensions: ['js', 'ts', 'mjs'],
  moduleNameMapper: {
    '#ansi-styles':
      '<rootDir>/node_modules/zx/node_modules/chalk/source/vendor/ansi-styles/index.js',
    '#supports-color':
      '<rootDir>/node_modules/zx/node_modules/chalk/source/vendor/supports-color/index.js',
  },
};
