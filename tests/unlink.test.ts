import * as A from 'fp-ts/lib/Array';
import * as S from 'fp-ts/lib/string';

import prompts from 'prompts';

import { pipe } from 'fp-ts/lib/function';
import { concatAll } from 'fp-ts/lib/Monoid';
import { MonoidAny } from 'fp-ts/lib/boolean';
import { default as linkCmd } from '@cmds/link';
import { default as unlinkCmd } from '@cmds/unlink';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { describe, test, expect, beforeAll } from '@jest/globals';
import {
  checkIfAllPathsAreValid,
  getDestinationPathsOfIgnoredFiles,
} from './helpers';

const UNLINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/unlink`;
const UNLINK_TEST_ASSERT_DIR = `${UNLINK_TEST_DATA_DIR}/mock-home`;

beforeAll(() => {
  process.env.HOME = UNLINK_TEST_ASSERT_DIR;

  process.env.DOTS = `${UNLINK_TEST_DATA_DIR}/mock-dots`;
  process.env.DOTFILES = `${UNLINK_TEST_DATA_DIR}/mock-dots`;
});

const VALID_MOCK_CONFIG_GRP_NAMES = ['git', 'bat', 'neovim', 'npm'];

describe('Tests for the happy path', () => {
  test.each([
    ['symlinked', []],
    ['copied', ['-c']],
    ['hardlinked', ['-H']],
  ])(
    'Should ensure that the unlink command can delete %s config files from their destination paths',
    async (_, mockLinkCmdCliOptions) => {
      // Arrange
      await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, mockLinkCmdCliOptions);

      // Act
      const {
        errors,
        output: cmdOutput,
        forTest: destinationPaths,
      } = await unlinkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

      const areAllDestinationFilesPresentAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPaths)();

      // Assert
      expect(errors).toEqual([]);
      expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalsy();
      expect(cmdOutput.length).toBeGreaterThanOrEqual(
        VALID_MOCK_CONFIG_GRP_NAMES.length
      );
    }
  );

  test.each([
    ['symlinks', []],
    ['copies', ['-c', '--copy']],
    ['hardlinks', ['-H', '--hardlink']],
  ])(
    'Should ensure that the unlink command defaults to removing %s of all config files in all config groups if none are explicitly specified',
    async (_, mockOptions) => {
      // Arrange
      process.env.DOTS = `${UNLINK_TEST_DATA_DIR}/valid-mock-dots`;
      process.env.DOTFILES = `${UNLINK_TEST_DATA_DIR}/valid-mock-dots`;

      prompts.inject([true, true]);

      await linkCmd([], mockOptions);

      // Act
      const {
        errors,
        output: cmdOutput,
        forTest: destinationPaths,
      } = await unlinkCmd([]);

      const areAllDestinationFilesPresentAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPaths)();

      // Assert
      expect(errors).toEqual([]);
      expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalsy();
      expect(cmdOutput.length).toBeGreaterThanOrEqual(
        VALID_MOCK_CONFIG_GRP_NAMES.length
      );

      // Cleanup
      process.env.DOTS = `${UNLINK_TEST_DATA_DIR}/mock-dots`;
      process.env.DOTFILES = `${UNLINK_TEST_DATA_DIR}/mock-dots`;
    }
  );

  test.each([
    ['symlinked', []],
    ['copied', ['-c']],
    ['hardlinked', ['-H']],
  ])(
    'Should ensure that the unlink command can delete %s config files from config groups even when some files are being ignored',
    async (_, mockLinkCmdCliOptions) => {
      // Arrange
      const mockConfigGrpNames = VALID_MOCK_CONFIG_GRP_NAMES.concat([
        'withAllIgnored',
        'withSomeIgnored',
      ]);

      const { forTest: configGrps } = await linkCmd(
        mockConfigGrpNames,
        mockLinkCmdCliOptions
      );

      // Act
      const {
        errors,
        output: cmdOutput,
        forTest: destinationPathsThatWereOperatedOn,
      } = await unlinkCmd(mockConfigGrpNames);

      const destinationPathsOfIgnoredFilesOnly =
        getDestinationPathsOfIgnoredFiles(configGrps);

      const areAllDestinationFilesPresentAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPathsThatWereOperatedOn)();

      const areIgnoredFilesPresentInListOfOperatedOnDestinationPaths = pipe(
        destinationPathsOfIgnoredFilesOnly,
        A.map(destinationPath =>
          A.elem(S.Eq)(destinationPath)(destinationPathsThatWereOperatedOn)
        ),
        concatAll(MonoidAny)
      );

      // Assert
      expect(errors).toEqual([]);
      expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalsy();
      expect(areIgnoredFilesPresentInListOfOperatedOnDestinationPaths).toBeFalsy();
      expect(cmdOutput.length).toBeGreaterThanOrEqual(
        destinationPathsThatWereOperatedOn.length
      );
    }
  );
});

describe('Tests for everything but the happy path', () => {
  const INVALID_MOCK_CONFIG_GRP_NAMES = ['fly-pie', 'mcfly', 'nvm', 'cava'];

  test('Should ensure that the unlink command can handle cases where the specified config groups do not exist', async () => {
    // Arrange
    await linkCmd(INVALID_MOCK_CONFIG_GRP_NAMES);

    // Act
    const {
      errors,
      output: cmdOutput,
      forTest: destinationPaths,
    } = await unlinkCmd(INVALID_MOCK_CONFIG_GRP_NAMES);

    // Assert
    expect([destinationPaths, cmdOutput]).toEqual([[], []]);
    expect(errors.length).toBeGreaterThanOrEqual(
      INVALID_MOCK_CONFIG_GRP_NAMES.length
    );
  });

  test('Should ensure that the unlink command can handle where cases the specified config groups have not been operated on by the link command', async () => {
    // Arrange
    // Act
    const { errors, output: cmdOutput } = await unlinkCmd(
      VALID_MOCK_CONFIG_GRP_NAMES
    );

    // Assert
    expect(cmdOutput).toEqual([]);
    expect(errors.length).toBeGreaterThanOrEqual(VALID_MOCK_CONFIG_GRP_NAMES.length);
  });
});
