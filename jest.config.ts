// eslint-disable-next-line import/no-extraneous-dependencies
import { defaults } from 'jest-config';
import type { JestConfigWithTsJest } from 'ts-jest';

const isCI = process.env?.CI ?? false;
const areWeTestingLibs = process.env?.FOR_LIB ?? false;

let collectCoverageFrom = areWeTestingLibs
  ? ['src/lib/**/test.ts']
  : ['src/*/{*.ts,!(lib)/**/*.ts}'];

let testPathIgnorePatterns = areWeTestingLibs ? ['/tests/'] : ['src/lib/'];

if (isCI) {
  collectCoverageFrom = [];
  testPathIgnorePatterns = defaults.testPathIgnorePatterns;
}

testPathIgnorePatterns = testPathIgnorePatterns.concat([
  '/tests/test-data/',
  'src/lib/minimal-argp',
]);

const config: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  testTimeout: 10000,
  testEnvironment: 'node',
  verbose: true,
  notify: !isCI,
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[tj]s?(x)'],
  collectCoverageFrom,
  testPathIgnorePatterns,
  setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/tests/setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'ts', 'mjs'],
  moduleNameMapper: {
    '#ansi-styles':
      '<rootDir>/node_modules/chalk/source/vendor/ansi-styles/index.js',
    '#supports-color':
      '<rootDir>/node_modules/chalk/source/vendor/supports-color/index.js',
    '@app/(.*)': '<rootDir>/src/app/$1',
    '@cmds/(.*)': '<rootDir>/src/cmds/$1',
    '@lib/(.*)': '<rootDir>/src/lib/$1',
    '@config/(.*)': '<rootDir>/src/config/$1',
    '@utils(.*)': '<rootDir>/src/utils/$1',
    '@types': '<rootDir>/src/types/index',
  },
  watchman: false,
};

export default config;
