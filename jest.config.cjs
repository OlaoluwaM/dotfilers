/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */

const { defaults } = require('jest-config');

const areWeTestingLibs = process.env?.FOR_LIB ?? false;
const isCI = process.env?.CI ?? false;

const collectCoverageFrom = areWeTestingLibs
  ? ['src/lib/**']
  : ['src/*/{*.ts,!(lib)/**/*.ts}'];

const testPathIgnorePatterns = areWeTestingLibs
  ? ['tests/**/*.ts']
  : ['src/lib/**/test.ts'];

if (isCI) {
  collectCoverageFrom = undefined;
  testPathIgnorePatterns = defaults.testPathIgnorePatterns;
}

module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testTimeout: 10000,
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[tj]s?(x)'],
  collectCoverageFrom,
  testPathIgnorePatterns,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
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
  watchman: false,
};
