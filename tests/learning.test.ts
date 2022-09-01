import { globby, $ } from 'zx';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { describe, test, expect } from '@jest/globals';

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
