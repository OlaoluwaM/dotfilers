import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';

import path from 'path';
import micromatch from 'micromatch';

import { pipe } from 'fp-ts/lib/function';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { describe, test, expect } from '@jest/globals';
import { globby, $, fs as fsExtra } from 'zx';
import { CONFIG_GRP_DEST_RECORD_FILE_NAME } from '../src/constants';
import { default as readdirp, ReaddirpOptions } from 'readdirp';
import { getRelativePathWithoutLeadingPathSeparator } from '@utils/index';

describe('Learning tests to verify behavior of globby package', () => {
  test("That globby doesn't error, but instead returns an empty array on no match", async () => {
    // Arrange
    const testDataDir = `${TEST_DATA_DIR_PREFIX}/learning/globby`;

    // Act
    const files = await globby(`${testDataDir}/ricko.*`);

    // Assert
    expect(files).toEqual([]);
  });

  test('That globby can retrieve all files in dir as needed by app', async () => {
    // Arrange
    const testDataDir = `${TEST_DATA_DIR_PREFIX}/learning/globby`;

    // Act
    const { stdout: rawStrOfNonTsFiles } =
      await $`ls -Rp ${testDataDir} | grep -v / | grep -Ev ".(ts|js)$" | grep -v "destinations.json" | sed -r '/^\s*$/d'`;

    const numberOfNonTsFiles = rawStrOfNonTsFiles.split('\n');

    const discoveredFiles = await globby('**/*', {
      ignore: ['**/*.ts', '**/*.js', 'destinations.json'],
      onlyFiles: true,
      cwd: testDataDir,
      absolute: true,
      objectMode: true,
    });

    // Assert
    expect(discoveredFiles).toHaveLength(numberOfNonTsFiles.length - 1);
  });
});

describe('Learning tests to verify behavior of fs-extra package', () => {
  test.each([
    ['exists', 'sample'],
    ['does not exist', 'tmp'],
  ])(
    'To ascertain assumptions about the behavior of the ensureDir method when a dir %s',
    async (testDescription, mockDir) => {
      // Arrange
      const testPath = `${TEST_DATA_DIR_PREFIX}/learning/fs-extra/${mockDir}`;

      let procErr;
      let procOutput;

      // Act
      try {
        const output = await fsExtra.ensureDir(testPath);
        procOutput = output;
      } catch (error) {
        procErr = error;
      }

      const doesDirExist = await fsExtra.pathExists(testPath);

      // Assert
      expect(doesDirExist).toBeTruthy();

      if (testDescription.includes('does not')) {
        expect([procOutput, procErr]).toEqual([testPath, undefined]);
      } else expect([procOutput, procErr]).toEqual([undefined, undefined]);
    }
  );
});

describe.skip('Learning tests to verify behavior of the micromatch package', () => {
  test('a', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let f: string = '';

    // Arrange
    const gb = {
      '*.js': 'rrr',
      'f*': 'scv',
    } as Record<string, string>;

    const onMatch = ({ glob }: { glob: string }) => {
      console.log({ glob });
      f = gb[glob];
    };

    // Act
    micromatch.isMatch('foo.js', ['f*', '*.js'], { onMatch });
    console.log({ f });
    // Assert
  });
});

describe('Learning tests to verify usage of the readdirp package', () => {
  const rootPath = `${TEST_DATA_DIR_PREFIX}/learning/readdirp/dirOne`;

  test('If I can omit retrieving files from directories that contain a certain file', async () => {
    // Arrange
    const config: Partial<ReaddirpOptions> = {
      fileFilter: [`!${CONFIG_GRP_DEST_RECORD_FILE_NAME}`],
      directoryFilter: ({ fullPath }) =>
        !fsExtra.pathExistsSync(
          path.join(fullPath, CONFIG_GRP_DEST_RECORD_FILE_NAME)
        ),
    };

    const expectedFiles = [
      'example.css',
      'index.ts',
      'sample.js',
      'innerTwo/example.ts',
      'innerTwo/farrow.rs',
      'innerThree/example.py',
      'innerThree/farrow.cc',
    ];

    // Act
    const returnedFiles = await pipe(
      () => readdirp.promise(rootPath, config),
      T.chainFirstIOK((o) => () => console.log(JSON.stringify(o, null, 2))),
      T.map(A.map(fileEntryInfo => fileEntryInfo.path))
    )();

    // Assert
    expect(returnedFiles).toEqual(expectedFiles);
  });

  test('Should ensure that I can get only those directories that contain a certain file', async () => {
    // Arrange
    const config: Partial<ReaddirpOptions> = {
      directoryFilter: ({ fullPath }) =>
        fsExtra.pathExistsSync(
          path.join(fullPath, CONFIG_GRP_DEST_RECORD_FILE_NAME)
        ),
      type: 'directories',
    };

    const expectedDirs = ['inner', 'innerFour', 'inner/innerTwo'];

    // Act
    const returnedDirs = await pipe(
      () => readdirp.promise(rootPath, config),
      T.chainFirstIOK(o => () => console.log(JSON.stringify(o, null, 2))),
      T.map(
        A.map(dirInfo =>
          getRelativePathWithoutLeadingPathSeparator(rootPath)(dirInfo.fullPath)
        )
      )
    )();

    // Assert
    expect(returnedDirs).toEqual(expectedDirs);
  });
});
