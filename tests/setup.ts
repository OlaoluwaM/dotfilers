import 'jest-extended';

import path from 'path';

import { jest } from '@jest/globals';
// import { getAbsolutePathsForFile } from '../src/constants.js';

// const { __dirname: __testDirname } = getAbsolutePathsForFile(import.meta.url);
export const TEST_DATA_DIR_PREFIX = path.join(__dirname, './test-data');

jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
