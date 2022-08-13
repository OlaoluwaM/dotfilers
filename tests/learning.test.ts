/* global describe, test, expect */
import { partition, wilt } from 'fp-ts/lib/Array';
import { pipe } from 'fp-ts/lib/function';
import { ApT, isRight, left, right } from 'fp-ts/lib/These';
import { traverse } from 'fp-ts/lib/Traversable';
import { globby, $ } from 'zx';
import { TEST_DATA_DIR_PREFIX } from './setup';

describe.skip('Learning tests to verify behavior of globby package', () => {
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

    console.log({ discoveredFiles });

    // Assert
    expect(discoveredFiles).toHaveLength(numberOfNonTsFiles.length - 1);
  });
});

describe('Learning tests to verify behavior of some fp-ts modules and operations', () => {
  test('Assertions on the `These` monad', () => {
    // Arrange
    const ss = [right(1), left(NaN), right(3), left(NaN), right(5)];
    const f = pipe(ss, partition(isRight));
    console.log(f);
    // Act
    // Assert
  });
});
