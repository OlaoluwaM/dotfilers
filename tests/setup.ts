import path from 'path';

import { $ } from 'zx';
import { getAbsolutePathsForFile } from '../src/constants';

$.verbose = !!process.env.CI;

const { __dirname: __testDirname } = getAbsolutePathsForFile(import.meta.url);
export const TEST_DATA_DIR_PREFIX = path.join(__testDirname, './test-data');
