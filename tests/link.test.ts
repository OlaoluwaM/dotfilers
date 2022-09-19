/* globals expect, describe, test, beforeAll */

import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import prompts from 'prompts';
import micromatch from 'micromatch';

import { pipe } from 'fp-ts/lib/function';
import { compose } from 'ramda';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { concatAll } from 'fp-ts/lib/Monoid';
import { default as linkCmd } from '@cmds/link';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { createDirIfItDoesNotExist } from '@utils/index';
import { getAllConfigGroupDirPaths } from '@app/helpers';
import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import { DestinationPath, File, SourcePath } from '@types';
import {
  ExitCodes,
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
} from '../src/constants';
import {
  isSymlink,
  isHardlink,
  manualFail,
  createFile,
  generatePath,
  fileRecordLens,
  sourcePathLens,
  fileBasenameLens,
  destinationPathLens,
  getFileNamesFromFiles,
  checkIfAllPathsAreValid,
  getDestinationPathsFromFiles,
  getFileNamesFromConfigGroups,
  getIgnoredFilesFromConfigGroups,
  getNonIgnoredFilesFromConfigGroups,
  getDestinationPathsForConfigGroups,
  getDestinationPathsFromConfigGroups,
} from './helpers';

const LINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/link`;
const LINK_TEST_ASSERT_DIR = `${LINK_TEST_DATA_DIR}/mock-home`;

const MOCK_DOTS_DIR = `${LINK_TEST_DATA_DIR}/mock-dots`;

beforeAll(() => {
  process.env.HOME = LINK_TEST_ASSERT_DIR;

  process.env.DOTS = MOCK_DOTS_DIR;
  process.env.DOTFILES = MOCK_DOTS_DIR;
});

const createConfigGroupFile = createFile(MOCK_DOTS_DIR);
const generateConfigGroupStructure = generatePath(MOCK_DOTS_DIR);

function getSourceAndDestinationPathsFromFileObj(configGroupFileObj: File) {
  return [
    sourcePathLens.get(configGroupFileObj),
    destinationPathLens.get(configGroupFileObj),
  ] as [SourcePath, DestinationPath];
}

const VALID_MOCK_CONFIG_GRP_NAMES = ['npm', 'bat', 'neovim', 'git'];

describe('Tests for the happy path', () => {
  test(`Should ensure that link command correctly creates symlinks of files at their intended destinations when both ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} and ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variables are set`, async () => {
    // Arrange
    // Act
    const { errors, forTest: configGroups } = await linkCmd(
      VALID_MOCK_CONFIG_GRP_NAMES
    );

    const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTrue();
  });

  test.each([['DOTS'], ['DOTFILES']])(
    `Should ensure that link command correctly creates symlinks of files at their intended destinations when only the %s variable is set`,
    async envVarName => {
      // Arrange
      process.env[envVarName] = '';

      // Act
      const { errors, forTest: configGroups } = await linkCmd(
        VALID_MOCK_CONFIG_GRP_NAMES
      );

      const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

      const doAllDestinationSymlinksExist = await pipe(
        destinationPaths,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationSymlinksExist).toBeTrue();

      // Cleanup
      process.env[envVarName] = MOCK_DOTS_DIR;
    }
  );

  test.each([['--hardlink'], ['-H']])(
    'Should ensure that link command hardlinks files to their destination instead of symlinking if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const { errors, forTest: configGroups } = await linkCmd(
        VALID_MOCK_CONFIG_GRP_NAMES,
        [mockOptions]
      );

      const sourceAndDestinationPaths = pipe(
        configGroups,
        getNonIgnoredFilesFromConfigGroups,
        A.map(getSourceAndDestinationPathsFromFileObj)
      );

      const doAllDestinationHardlinksExist = await pipe(
        sourceAndDestinationPaths,
        T.traverseArray(
          ([sourcePath, destinationPath]) =>
            () =>
              isHardlink(sourcePath, destinationPath)
        ),
        T.map(concatAll(MonoidAll))
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationHardlinksExist).toBeTrue();
    }
  );

  test.each([['--copy'], ['-c']])(
    'Should ensure that link command copies files to their destination instead of symlinking them if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const { errors, forTest: configGroups } = await linkCmd(
        VALID_MOCK_CONFIG_GRP_NAMES,
        [mockOptions]
      );

      const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

      const doAllDestinationFilesExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationFilesExist).toBeTrue();
    }
  );

  test('Should ensure that the link command defaults to symlinking files to their destinations should clashing options be supplied (--hardlink and --copy)', async () => {
    // Arrange
    // Act
    const { errors, forTest: configGroups } = await linkCmd(
      VALID_MOCK_CONFIG_GRP_NAMES,
      ['-H', '--copy']
    );

    const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTrue();
  });

  test.each([
    ['symlinking', []],
    ['copying', ['-c', '--copy']],
    ['hardlinking', ['-H', '--hardlink']],
  ])(
    'Should ensure that the link command defaults to %s files of all config groups to their destinations if no config group names are explicitly specified',
    async (_, mockOptions) => {
      // Arrange
      process.env.DOTS = `${LINK_TEST_DATA_DIR}/valid-mock-dots`;
      process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/valid-mock-dots`;

      prompts.inject([true]);

      // Act
      const { errors, forTest: configGroups } = await linkCmd([], mockOptions);

      const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

      const doAllDestinationPathsExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      const numberOfDirectoriesInDotfilesFolder = await pipe(
        process.env.DOTFILES,
        getAllConfigGroupDirPaths,
        TE.map(A.size)
      )();

      // Assert
      pipe(
        numberOfDirectoriesInDotfilesFolder,
        E.chainFirst(() => E.right(expect(errors).toEqual([]))),
        E.chainFirstW(() => E.right(expect(doAllDestinationPathsExist).toBeTrue())),
        E.mapLeft(manualFail)
      );

      // Cleanup
      process.env.DOTS = MOCK_DOTS_DIR;
      process.env.DOTFILES = MOCK_DOTS_DIR;
    }
  );

  test.each([
    ['does nothing if all files in a config group are ignored', ['withAllIgnored']],
    [
      'only operates on those files within a config group that are not being ignored',
      ['withSomeIgnored'],
    ],
  ])(
    `Should ensure that link command %s`,
    async (testDescription, mockConfigGroupNames) => {
      // Arrange
      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const destinationPathsOfNonIgnoredFilesOnly = pipe(
        getNonIgnoredFilesFromConfigGroups(configGroups),
        A.map(destinationPathLens.get)
      );

      const destinationPathsOfIgnoredFilesOnly = pipe(
        getIgnoredFilesFromConfigGroups(configGroups),
        A.map(destinationPathLens.get)
      );

      const allNonIgnoredFilesWereSymlinked = await pipe(
        destinationPathsOfNonIgnoredFilesOnly,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      const allIgnoredFilesWereSymlinked = await pipe(
        destinationPathsOfIgnoredFilesOnly,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      const isTestForIgnoringAllFiles = testDescription.includes('all');

      // Assert
      expect(errors).toEqual([]);
      expect(allIgnoredFilesWereSymlinked).toBeFalse();

      if (isTestForIgnoringAllFiles) {
        expect(actualCmdOutput).toEqual([]);
        expect(destinationPathsOfNonIgnoredFilesOnly).toEqual([]);
      } else {
        expect(allNonIgnoredFilesWereSymlinked).toBeTrue();
      }
    }
  );

  test(`Should ensure that link command operates successfully when all files in config group are directed to the same destination path`, async () => {
    // Arrange
    const mockConfigGroupName = 'withAllDotsToOneLoc';
    const defaultDestinationPathShellStr = '~/.config';

    const mockDestinationsRecord = {
      [ALL_FILES_CHAR]: defaultDestinationPathShellStr,
    };

    const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

    const mockConfigGroupSetupTask = pipe(
      generateConfigGroupStructure(mockConfigGroupName),
      createDirIfItDoesNotExist
    );

    const mockConfigGroupFiles = ['sample.rs', 'setup.ts', '.configrc'];

    const mockConfigGroupFilesCreationTask = pipe(
      mockConfigGroupFiles,
      T.traverseArray(compose(createConfigGroupFile, generateConfigGroupEntityPath))
    );

    const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
      generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
      JSON.stringify(mockDestinationsRecord)
    );

    await mockConfigGroupSetupTask();
    await mockConfigGroupFilesCreationTask();
    await mockConfigGroupDestinationRecordCreationTask();

    // Act
    const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

    const defaultDestinationPath = expandShellVariablesInString(
      defaultDestinationPathShellStr
    );

    const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    const doAllDestinationPathsPointToTheDefault = pipe(
      destinationPaths,
      A.map(path.dirname),
      A.every(destPath => S.Eq.equals(defaultDestinationPath, destPath))
    );

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTrue();
    expect(doAllDestinationPathsPointToTheDefault).toBeTrue();
  });

  test.each([
    ['', ['tilix']],
    [
      'even if destination record file has entries with some invalid destination path values',
      ['withPathIssues'],
    ],
  ])(
    `Should ensure that by default, all files in a config group have a destination path of the $HOME directory %s`,
    async (_, mockConfigGroupNames) => {
      // Arrange
      // Act
      const { errors, forTest: configGroups } = await linkCmd(mockConfigGroupNames);

      const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

      const doAllDestinationSymlinksExist = await pipe(
        destinationPaths,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      const allDestinationPathsPointToHomeDirectory = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destinationPath => S.Eq.equals(process.env.HOME!, destinationPath))
      );

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationSymlinksExist).toBeTrue();
      expect(allDestinationPathsPointToHomeDirectory).toBeTrue();
    }
  );

  describe('Tests for glob support', () => {
    test('Should ensure that the link command can correctly match and operate on glob patterns (even if there are conflicting glob patterns. It should pick the associated path to the first matching glob pattern as listed in the destination record file)', async () => {
      // Arrange
      const mockConfigGroupName = 'withGlobsOnly';
      const matchingGlobDestinationPathShellStr = '~/.config/node';

      const mockDestinationsRecord = {
        '*.js': matchingGlobDestinationPathShellStr,
        '*s': '~/.config/ss',
      };

      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructure(mockConfigGroupName),
        createDirIfItDoesNotExist
      );

      const mockConfigGroupFiles = ['example.js', 'special.js', 'gater.js'];

      const mockConfigGroupFilesCreationTask = pipe(
        mockConfigGroupFiles,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecord)
      );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockConfigGroupDestinationRecordCreationTask();

      // Act
      const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

      const configGroupFileNames = getFileNamesFromConfigGroups(configGroups);

      const targetDestinationPathForAllFiles = expandShellVariablesInString(
        matchingGlobDestinationPathShellStr
      );

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationPathsPointToTheSameDir = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(targetDestinationPathForAllFiles, destPath))
      );

      const doAllConfigGroupFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPaths)();

      // Assert
      expect(errors).toEqual([]);
      expect(configGroupFileNames).toIncludeAllMembers(mockConfigGroupFiles);
      expect(doAllDestinationPathsPointToTheSameDir).toBeTrue();
      expect(doAllConfigGroupFilesExistAtTheirDestinationPaths).toBeTrue();
    });

    test('Should ensure that the link command prioritizes direct filename destinations over glob destinations', async () => {
      // Arrange
      const mockConfigGroupName = 'mcfly';
      const mockDestinationPathShellStr = '~/.config/mcfly/final';

      const mockDestinationsRecord = {
        '*.js': '~/.config/node',
        '*s': '~/.config/ss',
        'sample.js': mockDestinationPathShellStr,
        'example.js': mockDestinationPathShellStr,
      };

      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructure(mockConfigGroupName),
        createDirIfItDoesNotExist
      );

      const testTargetFileNames = ['example.js', 'sample.js'];
      const allMockConfigGroupFiles = [
        'special.js',
        'gater.js',
        'cat.js',
        'index.js',
      ].concat(testTargetFileNames);

      const mockConfigGroupFilesCreationTask = pipe(
        allMockConfigGroupFiles,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecord)
      );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockConfigGroupDestinationRecordCreationTask();

      // Act
      const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

      const configGroupFileNames = getFileNamesFromConfigGroups(configGroups);

      const destinationPathForTargetedFiles = expandShellVariablesInString(
        mockDestinationPathShellStr
      );

      const fileRecord = fileRecordLens.get(configGroups[0]);
      const destinationPathsOfTargetedFiles = pipe(
        testTargetFileNames,
        A.map(filename => fileRecord[filename].destinationPath)
      );

      const destinationPathsForAllFiles =
        getDestinationPathsForConfigGroups(configGroups);

      const directFileNameDestinationPathsWereChosenOverGlobDestPaths = pipe(
        destinationPathsOfTargetedFiles,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(destinationPathForTargetedFiles, destPath))
      );

      const doAllConfigGroupFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPathsForAllFiles)();

      // Assert
      expect(errors).toEqual([]);
      expect(configGroupFileNames).toIncludeAllMembers(allMockConfigGroupFiles);
      expect(doAllConfigGroupFilesExistAtTheirDestinationPaths).toBeTrue();
      expect(directFileNameDestinationPathsWereChosenOverGlobDestPaths).toBeTrue();
    });

    test('Should ensure that the link command allows for ignoring files using glob patterns', async () => {
      // Arrange
      const mockConfigGroupName = 'withGlobsOnly';

      const mockDestinationsRecord = {
        [EXCLUDE_KEY]: ['*.js', '*.ts'],
        [ALL_FILES_CHAR]: '~/.sample/default',
      };

      const nestedDirName = 'inner';
      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructure(generateConfigGroupEntityPath(nestedDirName)),
        createDirIfItDoesNotExist
      );

      const nestedConfigGroupFiles = pipe(
        ['cat.rs', 'index.py', 'example.json'],
        A.map(filename => path.join(nestedDirName, filename))
      );

      const mockConfigGroupFiles = [
        'example.js',
        'special.ts',
        'gater.js',
        'sample.ts',
      ];

      const allMockConfigGroupFiles = A.concat(mockConfigGroupFiles)(
        nestedConfigGroupFiles
      );

      const allIgnoredFiles = pipe(
        allMockConfigGroupFiles,
        A.map(path.basename),
        filenames => micromatch(filenames, mockDestinationsRecord[EXCLUDE_KEY])
      );

      const mockConfigGroupFilesCreationTask = pipe(
        allMockConfigGroupFiles,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecord)
      );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockConfigGroupDestinationRecordCreationTask();

      // Act
      const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

      const ignoredFileNames = pipe(
        getIgnoredFilesFromConfigGroups(configGroups),
        A.map(fileBasenameLens.get)
      );

      const ignoredFileNameDestinationPaths = pipe(
        getIgnoredFilesFromConfigGroups(configGroups),
        A.map(destinationPathLens.get)
      );

      const allIgnoredFileDestinationPathsAreValid = await checkIfAllPathsAreValid(
        ignoredFileNameDestinationPaths
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(ignoredFileNames).toIncludeAllMembers(allIgnoredFiles);
      expect(allIgnoredFileDestinationPathsAreValid).toBeFalse();
    });

    test('Should ensure that the link command matches globs with nested files as well', async () => {
      // Arrange
      const mockConfigGroupName = 'nestedWithGlob';
      const mockDestinationPathShellStr = '$HOME/globs/files';

      const mockDestinationsRecord = {
        '*.?(ts|json|md)': mockDestinationPathShellStr,
      };

      const nestedDirNameInMockConfigGroup = `inner`;
      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructure(
          generateConfigGroupEntityPath(nestedDirNameInMockConfigGroup)
        ),
        createDirIfItDoesNotExist
      );

      const mockNestedConfigGroupFiles = pipe(
        ['config.json', 'sample.ts', 'readme.md'],
        A.map(fileName => path.join(nestedDirNameInMockConfigGroup, fileName))
      );

      const mockConfigGroupFilesCreationTask = pipe(
        mockNestedConfigGroupFiles,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecord)
      );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockConfigGroupDestinationRecordCreationTask();

      // Act
      const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

      const configGroupFileNames = getFileNamesFromConfigGroups(configGroups);

      const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

      const defaultFileDestinationPath = expandShellVariablesInString(
        mockDestinationPathShellStr
      );

      const doAllFileDestinationPathsPointToTheDefault = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(defaultFileDestinationPath, destPath))
      );

      // Assert
      expect(errors).toEqual([]);
      expect(configGroupFileNames).toIncludeAllMembers(mockNestedConfigGroupFiles);
      expect(doAllFileDestinationPathsPointToTheDefault).toBeTrue();
    });
  });

  describe('Tests for nested files support', () => {
    test.each([
      ['symlink', []],
      ['copy', ['-c']],
      ['hardlink', ['-H']],
    ])(
      'Should ensure that the link command can %s nested files (with slashes and relative paths)',
      async (_, cmdOptions) => {
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
          generateConfigGroupStructure(generateConfigGroupEntityPath(nestedDirName)),
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
          T.traverseArray(
            compose(createConfigGroupFile, generateConfigGroupEntityPath)
          )
        );

        const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
          generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
          JSON.stringify(mockDestinationsRecord)
        );

        await mockConfigGroupSetupTask();
        await mockConfigGroupFilesCreationTask();
        await mockConfigGroupDestinationRecordCreationTask();

        // Act
        const { errors, forTest: configGroups } = await linkCmd(
          [mockConfigGroupName],
          cmdOptions
        );

        const fileRecord = fileRecordLens.get(configGroups[0]);
        const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

        const expectedDestinationPathForNestedFiles = expandShellVariablesInString(
          nestedFileDestinationPathShellStr
        );

        const allNestedFilesWerePlacedAtTheirSpecifiedDestinationPath = pipe(
          nestedFileNames,
          A.map(
            compose(path.dirname, fileName => fileRecord[fileName].destinationPath)
          ),
          A.every(destPath => destPath === expectedDestinationPathForNestedFiles)
        );

        const allConfigGroupFilesWerePlacedAtDestinationPath =
          await checkIfAllPathsAreValid(destinationPaths)();

        // Assert
        expect(errors).toEqual([]);
        expect(allConfigGroupFilesWerePlacedAtDestinationPath).toBeTrue();
        expect(allNestedFilesWerePlacedAtTheirSpecifiedDestinationPath).toBeTrue();
      }
    );

    test('Should ensure that the link command supports deeply nested config groups', async () => {
      // Arrange
      const mockConfigGroupName = 'deeplyNested';
      const nestedFileDestinationPathShellStr = '~/rust/sample';

      const mockDestinationsRecord = {
        'inner/sample/sample/sample.rs': nestedFileDestinationPathShellStr,
      };

      const nestedDirName = 'inner/sample/sample';
      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructure(generateConfigGroupEntityPath(nestedDirName)),
        createDirIfItDoesNotExist
      );

      const nestedFileNames = pipe(
        ['sample.rs'],
        A.map(filename => path.join(nestedDirName, filename))
      );

      const allFileNames = nestedFileNames;

      const mockConfigGroupFilesCreationTask = pipe(
        allFileNames,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecord)
      );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockConfigGroupDestinationRecordCreationTask();

      // Act
      const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

      const expectedDestinationPath = expandShellVariablesInString(
        nestedFileDestinationPathShellStr
      );

      const destinationPaths = getDestinationPathsForConfigGroups(configGroups);

      const nestedFilesPointToTheExpectedDestinationPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(expectedDestinationPath, destPath))
      );

      const allNestedFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPaths)();

      // Assert
      expect(errors).toEqual([]);
      expect(allNestedFilesExistAtTheirDestinationPaths).toBeTrue();
      expect(nestedFilesPointToTheExpectedDestinationPath).toBeTrue();
    });

    test('Should ensure that the link command can ignore nested files in a config group', async () => {
      // Arrange
      const mockConfigGroupName = 'nestedIgnore';

      const mockDestinationsRecord = {
        [EXCLUDE_KEY]: ['inner/example.js'],
      };

      const nestedDirName = 'inner';
      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructure(generateConfigGroupEntityPath(nestedDirName)),
        createDirIfItDoesNotExist
      );

      const nestedFileNames = pipe(
        ['example.js'],
        A.map(filename => path.join(nestedDirName, filename))
      );

      const allFileNames = nestedFileNames;

      const mockConfigGroupFilesCreationTask = pipe(
        allFileNames,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockConfigGroupDestinationRecordCreationTask = createConfigGroupFile(
        generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
        JSON.stringify(mockDestinationsRecord)
      );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockConfigGroupDestinationRecordCreationTask();

      // Act
      const { errors, forTest: configGroups } = await linkCmd([mockConfigGroupName]);

      const ignoredFiles = getIgnoredFilesFromConfigGroups(configGroups);

      const ignoredFilenames = getFileNamesFromFiles(ignoredFiles);
      const ignoredFileDestinationPaths = getDestinationPathsFromFiles(ignoredFiles);

      const allNestedFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(ignoredFileDestinationPaths)();

      // Assert
      expect(errors).toEqual([]);
      expect(allNestedFilesExistAtTheirDestinationPaths).toBeFalse();

      expect(ignoredFilenames).toIncludeSameMembers(
        mockDestinationsRecord[EXCLUDE_KEY]
      );
    });
  });

  describe.skip('Tests for nested config groups', () => {
    // ? Break this up into two tests (rewrite)
    // * One for checking if we can work with nested config groups
    // * Another for asserting that nested config groups have their contents isolated from their parent
    // ! Do away with assertion on command output, makes tests flaky
    test('Should ensure that the link command works with nested config groups as it would any other, top-level, config group and that files within a nested config group are unseen by parent config group of the nested config group', async () => {
      // Arrange
      const mockConfigGroupNames = [
        'nestedConfigGroup/innerTwo',
        'nestedConfigGroup',
      ];

      const expectedFilesForInnerConfigGroup = [
        'config.toml',
        'example.ts',
        'sample.txt',
        'test.html',
        'config.yaml', // Within a directory within the nested config group
        'user.css', // Within a directory within the nested config group
      ];

      const expectedFilesForOuterConfigGroup = [
        'example.js',
        'sample.rs',
        'test.ts',
        '.configrc',
        'example.py',
        'sample.cc',
        'test.md',
        '.xresources',
      ];

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const defaultDestinationPathForInnerConfigGroupFiles =
        configGroups[0].destinationRecord[ALL_FILES_CHAR];

      const destinationPathsForInnerConfigGroup =
        getDestinationPathsFromConfigGroups([configGroups[0]]);

      const filesForInnerConfigGroup = pipe(
        destinationPathsForInnerConfigGroup,
        A.map(destPath => path.basename(destPath))
      );
      const filesForOuterConfigGroup = pipe(
        [configGroups[1]],
        getDestinationPathsFromConfigGroups,
        A.map(destPath => path.basename(destPath))
      );

      const doAllDestinationSymlinksForInnerConfigGroupFiles = await pipe(
        destinationPathsForInnerConfigGroup,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      const doAllDestinationPathsForInnerConfigGroupFilesPointToTheDefault = pipe(
        destinationPathsForInnerConfigGroup,
        A.map(path.dirname),
        A.every(destPath =>
          S.Eq.equals(defaultDestinationPathForInnerConfigGroupFiles, destPath)
        )
      );

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationSymlinksForInnerConfigGroupFiles).toBeTruthy();

      expect(
        doAllDestinationPathsForInnerConfigGroupFilesPointToTheDefault
      ).toBeTruthy();

      expect(filesForInnerConfigGroup).toIncludeAllMembers(
        expectedFilesForInnerConfigGroup
      );

      expect(filesForOuterConfigGroup).toIncludeAllMembers(
        expectedFilesForOuterConfigGroup
      );

      expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
        mockConfigGroupNames.length
      );

      expect(filesForOuterConfigGroup).not.toIncludeAllMembers(
        filesForInnerConfigGroup
      );
    });
  });
});

describe('Tests for everything but the happy path', () => {
  const INVALID_MOCK_CONFIG_GRP_NAMES = ['node', 'spicetify', 'notion', 'cava'];

  test('Should check that the link command performs no operation if the specified config groups do not exist', async () => {
    // Arrange
    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: configGroups,
    } = await linkCmd(INVALID_MOCK_CONFIG_GRP_NAMES);

    // Assert
    expect([configGroups, actualCmdOutput]).toEqual([[], []]);

    expect(errors.length).toBeGreaterThanOrEqual(
      INVALID_MOCK_CONFIG_GRP_NAMES.length
    );
  });

  test.each([
    ['invalid', INVALID_MOCK_CONFIG_GRP_NAMES],
    ['valid', VALID_MOCK_CONFIG_GRP_NAMES],
  ])(
    'Should check that the link command fails gracefully if the necessary environment variables were not set and we were to supply %s config group names',
    async (_, mockConfigGroupNames) => {
      // Arrange
      process.env.DOTS = '';
      process.env.DOTFILES = '';

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(mockConfigGroupNames.length);
      expect([configGroups, actualCmdOutput]).toEqual([[], []]);

      // Cleanup
      process.env.DOTS = MOCK_DOTS_DIR;
      process.env.DOTFILES = MOCK_DOTS_DIR;
    }
  );

  test('Should ensure that the link command exits gracefully should we decline to operate on all config groups', async () => {
    // Arrange
    prompts.inject([false]);

    // Act
    await linkCmd([]);

    // Assert
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.OK);
  });
});
