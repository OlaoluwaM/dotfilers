/* globals expect, describe, test, beforeAll */

import * as A from 'fp-ts/lib/Array';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';

import path from 'path';

import { compose } from 'ramda';
import { flow, pipe } from 'fp-ts/lib/function';
import { default as linkCmd } from '@cmds/link';
import { default as unlinkCmd } from '@cmds/unlink';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { createDirIfItDoesNotExist } from '@utils/index';
import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import { ALL_FILES_CHAR, CONFIG_GRP_DEST_RECORD_FILE_NAME } from '../src/constants';
import {
  createFile,
  generatePath,
  checkIfAllPathsAreValid,
  getFileNamesFromConfigGroups,
  getDestinationPathsOfIgnoredFiles,
  getAllDestinationPathsFromConfigGroups,
} from './helpers';

const UNLINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/unlink`;
const UNLINK_TEST_ASSERT_DIR = `${UNLINK_TEST_DATA_DIR}/mock-home`;

const MOCK_DOTS_DIR = `${UNLINK_TEST_DATA_DIR}/mock-dots`;

beforeAll(() => {
  process.env.HOME = UNLINK_TEST_ASSERT_DIR;

  process.env.DOTS = MOCK_DOTS_DIR;
  process.env.DOTFILES = MOCK_DOTS_DIR;
});

const createConfigGroupFile = createFile(MOCK_DOTS_DIR);
const generateConfigGroupStructurePath = generatePath(MOCK_DOTS_DIR);

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
      const { errors, forTest: operatedOnDestinationPaths } = await unlinkCmd(
        VALID_MOCK_CONFIG_GRP_NAMES
      );

      const areAllDestinationFilesPresentAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(operatedOnDestinationPaths)();

      // Assert
      expect(errors).toBeEmpty();
      expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalse();
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

      const { forTest: configGroups } = await linkCmd(
        [],
        mockOptions.concat(['-y'])
      );

      const linkCmdDestinationPaths =
        getAllDestinationPathsFromConfigGroups(configGroups);

      // Act
      const { errors, forTest: operatedOnDestinationPaths } = await unlinkCmd(
        [],
        ['--yes']
      );

      const areAllDestinationFilesPresentAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(operatedOnDestinationPaths)();

      // Assert
      expect(errors).toBeEmpty();
      expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalse();

      expect(linkCmdDestinationPaths).toIncludeSameMembers(
        operatedOnDestinationPaths
      );

      // Cleanup
      process.env.DOTS = MOCK_DOTS_DIR;
      process.env.DOTFILES = MOCK_DOTS_DIR;
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
      const mockConfigGroupNames = VALID_MOCK_CONFIG_GRP_NAMES.concat([
        'withAllIgnored',
        'withSomeIgnored',
      ]);

      const { forTest: configGroups } = await linkCmd(
        mockConfigGroupNames,
        mockLinkCmdCliOptions
      );

      // Act
      const { errors, forTest: operatedOnDestinationPaths } = await unlinkCmd(
        mockConfigGroupNames
      );

      const destinationPathsOfIgnoredFilesOnly =
        getDestinationPathsOfIgnoredFiles(configGroups);

      const areAllDestinationFilesPresentAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(operatedOnDestinationPaths)();

      // Assert
      expect(errors).toBeEmpty();
      expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalse();

      expect(operatedOnDestinationPaths).not.toIncludeAllMembers(
        destinationPathsOfIgnoredFilesOnly
      );
    }
  );

  test('Should ensure that the unlink command can operate on nested config groups', async () => {
    // Arrange
    const mockConfigGroupName = 'nestedConfigGroup';
    const nestedConfigGroupDefaultDestPathShellStr = '$HOME/.mock/nested';

    const mockDestinationsRecordForTopLevelConfigGroup = {
      [ALL_FILES_CHAR]: '$HOME/.mock/topLevel',
    };

    const mockDestinationsRecordForNestedConfigGroup = {
      [ALL_FILES_CHAR]: nestedConfigGroupDefaultDestPathShellStr,
    };

    const nestedConfigGroupName = 'innerConfigGroup';
    const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

    const mockConfigGroupSetupTask = pipe(
      generateConfigGroupStructurePath(
        generateConfigGroupEntityPath(nestedConfigGroupName)
      ),
      createDirIfItDoesNotExist
    );

    const topLevelConfigGroupFileNames: string[] = [];

    const nestedConfigGroupFileNames = pipe(
      ['sample.rs', 'index.ts', 'user.md'],
      A.map(filename => path.join(nestedConfigGroupName, filename))
    );

    const allConfigGroupFileNames = [
      ...topLevelConfigGroupFileNames,
      ...nestedConfigGroupFileNames,
    ];

    const mockConfigGroupFilesCreationTask = pipe(
      allConfigGroupFileNames,
      T.traverseArray(compose(createConfigGroupFile, generateConfigGroupEntityPath))
    );

    const mockTopLevelConfigGroupDestinationRecordCreationTask =
      createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecordForTopLevelConfigGroup)
      );

    const mockNestedConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
      generateConfigGroupEntityPath(
        path.join(nestedConfigGroupName, CONFIG_GRP_DEST_RECORD_FILE_NAME)
      ),
      JSON.stringify(mockDestinationsRecordForNestedConfigGroup)
    );

    await mockConfigGroupSetupTask();
    await mockConfigGroupFilesCreationTask();
    await mockNestedConfigGroupDestinationRecordCreationTask();
    await mockTopLevelConfigGroupDestinationRecordCreationTask();

    const configGroupNames = [`${mockConfigGroupName}/${nestedConfigGroupName}`];

    const { forTest: configGroups } = await linkCmd(configGroupNames);

    // Act
    const { errors, forTest: operatedOnDestinationPaths } = await unlinkCmd(
      configGroupNames
    );

    const nestedConfigGroupDestinationPaths =
      getAllDestinationPathsFromConfigGroups(configGroups);

    const expectedDestPathForAllFilesInNestedConfigGroup =
      expandShellVariablesInString(nestedConfigGroupDefaultDestPathShellStr);

    const expectedDestinationPathsToHaveBeenOperatedOn = pipe(
      nestedConfigGroupFileNames,
      A.map(
        flow(
          path.basename,
          basename => path.join(nestedConfigGroupDefaultDestPathShellStr, basename),
          expandShellVariablesInString
        )
      )
    );

    const allNestedConfigGroupDestinationPathsPointToTheExpectedDefault = pipe(
      nestedConfigGroupDestinationPaths,
      A.map(path.dirname),
      A.every(destPath =>
        S.Eq.equals(expectedDestPathForAllFilesInNestedConfigGroup, destPath)
      )
    );

    const allNestedFilesExistAtTheirDestinationPaths = await checkIfAllPathsAreValid(
      nestedConfigGroupDestinationPaths
    )();

    // Assert
    expect(errors).toBeEmpty();
    expect(allNestedFilesExistAtTheirDestinationPaths).toBeFalse();
    expect(allNestedConfigGroupDestinationPathsPointToTheExpectedDefault).toBeTrue();

    expect(operatedOnDestinationPaths).toIncludeSameMembers(
      expectedDestinationPathsToHaveBeenOperatedOn
    );
  });

  test('Should ensure that the unlink command can operate on nested files within config groups', async () => {
    // Arrange
    const mockConfigGroupName = 'nested';
    const nestedFileDestinationPathShellStr = '~/.config/nested/inner';

    const mockDestinationsRecord = {
      '/inner/user.css': nestedFileDestinationPathShellStr,
      'user.css': '~/.config/other/styles',
      './inner/sample.js': nestedFileDestinationPathShellStr,
      'inner/test.ts': nestedFileDestinationPathShellStr,
    };

    const nestedDirName = 'inner';
    const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

    const mockConfigGroupSetupTask = pipe(
      generateConfigGroupStructurePath(generateConfigGroupEntityPath(nestedDirName)),
      createDirIfItDoesNotExist
    );

    const nestedFileNames = pipe(
      ['user.css', 'sample.js', 'test.ts'],
      A.map(filename => path.join(nestedDirName, filename))
    );

    const topLevelFileNames = ['user.css', 'sample.ts', 'config.toml'];

    const allFileNames = [...topLevelFileNames, ...nestedFileNames];

    const mockConfigGroupFilesCreationTask = pipe(
      allFileNames,
      T.traverseArray(compose(createConfigGroupFile, generateConfigGroupEntityPath))
    );

    const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
      generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
      JSON.stringify(mockDestinationsRecord)
    );

    await mockConfigGroupSetupTask();
    await mockConfigGroupFilesCreationTask();
    await mockConfigGroupDestinationRecordCreationTask();

    const { forTest: configGroups } = await linkCmd([mockConfigGroupName]);

    // Act
    const { errors } = await unlinkCmd([mockConfigGroupName]);

    const allFileNamesInConfigGroups = getFileNamesFromConfigGroups(configGroups);

    const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

    const allConfigGroupFilesWerePlacedAtDestinationPath =
      await checkIfAllPathsAreValid(destinationPaths)();

    // Assert
    expect(errors).toBeEmpty();
    expect(allFileNamesInConfigGroups).toIncludeSameMembers(allFileNames);
    expect(allConfigGroupFilesWerePlacedAtDestinationPath).toBeFalse();
  });
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
      forTest: operatedOnDestinationPaths,
    } = await unlinkCmd(INVALID_MOCK_CONFIG_GRP_NAMES);

    // Assert
    expect(cmdOutput).toBeEmpty();
    expect(operatedOnDestinationPaths).toBeEmpty();

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
    expect(cmdOutput).toBeEmpty();
    expect(errors.length).toBeGreaterThanOrEqual(VALID_MOCK_CONFIG_GRP_NAMES.length);
  });
});
