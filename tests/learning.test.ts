import { TEST_DATA_DIR_PREFIX } from './setup';
import { describe, test, expect } from '@jest/globals';
import { globby, $, fs as fsExtra } from 'zx';

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
    async (_, mockDir) => {
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
      expect([procOutput, procErr]).toEqual([undefined, undefined]);
    }
  );
});
