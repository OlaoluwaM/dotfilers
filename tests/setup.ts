import 'jest-extended';

import path from 'path';

import { jest } from '@jest/globals';
import { getAbsolutePathsForFile } from '../src/constants';

const { __dirname: __testDirname } = getAbsolutePathsForFile(import.meta.url);
export const TEST_DATA_DIR_PREFIX = path.join(__testDirname, './test-data');

jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
