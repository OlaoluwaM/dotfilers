/* globals expect, describe, test, beforeAll */

import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import prompts from 'prompts';
import micromatch from 'micromatch';

import { compose } from 'ramda';
import { flow, pipe } from 'fp-ts/lib/function';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { concatAll } from 'fp-ts/lib/Monoid';
import { default as _linkCmd } from '@cmds/link';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { createDirIfItDoesNotExist } from '@utils/index';
import { getAllConfigGroupDirPaths } from '@app/helpers';
import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import {
  File,
  SourcePath,
  toCmdOptions,
  DestinationPath,
  toPositionalArgs,
  CurriedReturnType,
} from '@types';
import {
  ExitCodes,
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
} from '../src/constants';
import {
  isSymlink,
  ExcludeFn,
  ExtractFn,
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
  getAllDestinationPathsFromConfigGroups,
} from './helpers';

// TODO: Implement tests using TaskEither Interface instead
const linkCmd = flow(_linkCmd, TE.toUnion);

type CmdOutput = Awaited<CurriedReturnType<typeof linkCmd>>;

export type CmdDataOutput = ExcludeFn<CmdOutput>;

type ProcessExitFn = ExtractFn<CmdOutput>;

const LINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/link`;
const LINK_TEST_ASSERT_DIR = `${LINK_TEST_DATA_DIR}/mock-home`;

const MOCK_DOTS_DIR = `${LINK_TEST_DATA_DIR}/mock-dots`;

beforeAll(() => {
  process.env.HOME = LINK_TEST_ASSERT_DIR;

  process.env.DOTS = MOCK_DOTS_DIR;
  process.env.DOTFILES = MOCK_DOTS_DIR;
});

const createConfigGroupFile = createFile(MOCK_DOTS_DIR);
const generateConfigGroupStructurePath = generatePath(MOCK_DOTS_DIR);

function getSourceAndDestinationPathsFromFileObj(configGroupFileObj: File) {
  return [
    sourcePathLens.get(configGroupFileObj),
    destinationPathLens.get(configGroupFileObj),
  ] as [SourcePath, DestinationPath];
}

const VALID_MOCK_CONFIG_GRP_NAMES = pipe(
  ['npm', 'bat', 'neovim', 'git'],
  toPositionalArgs
);

describe('Tests for the happy path', () => {
  test(`Should ensure that link command correctly creates symlinks of files at their intended destinations when both ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} and ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variables are set`, async () => {
    // Arrange
    // Act
    const cmdOutput = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, [])();

    const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

    const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toBeEmpty();
    expect(doAllDestinationSymlinksExist).toBeTrue();
  });

  test.each([['DOTS'], ['DOTFILES']])(
    `Should ensure that link command correctly creates symlinks of files at their intended destinations when only the %s variable is set`,
    async envVarName => {
      // Arrange
      process.env[envVarName] = '';

      // Act
      const cmdOutput = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, [])();

      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationSymlinksExist = await pipe(
        destinationPaths,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      // Assert
      expect(errors).toBeEmpty();
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
      const cmdOutput = await linkCmd(
        VALID_MOCK_CONFIG_GRP_NAMES,
        toCmdOptions([mockOptions])
      )();

      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

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
      expect(errors).toBeEmpty();
      expect(doAllDestinationHardlinksExist).toBeTrue();
    }
  );

  test.each([['--copy'], ['-c']])(
    'Should ensure that link command copies files to their destination instead of symlinking them if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const cmdOutput = await linkCmd(
        VALID_MOCK_CONFIG_GRP_NAMES,
        toCmdOptions([mockOptions])
      )();

      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationFilesExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toBeEmpty();
      expect(doAllDestinationFilesExist).toBeTrue();
    }
  );

  test('Should ensure that the link command defaults to symlinking files to their destinations should clashing options be supplied (--hardlink and --copy)', async () => {
    // Arrange
    // Act
    const cmdOutput = await linkCmd(
      VALID_MOCK_CONFIG_GRP_NAMES,
      toCmdOptions(['-H', '--copy'])
    )();

    const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

    const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toBeEmpty();
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

      // Act
      const cmdOutput = await linkCmd(
        [],
        toCmdOptions(mockOptions.concat(['-y']))
      )();

      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

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
        E.chainFirst(() => E.right(expect(errors).toBeEmpty())),
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
      const cmdOutput = await linkCmd(toPositionalArgs(mockConfigGroupNames), [])();

      const {
        errors,
        output: cmdResponse,
        testOutput: configGroups,
      } = cmdOutput as CmdDataOutput;

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
      expect(errors).toBeEmpty();
      expect(allIgnoredFilesWereSymlinked).toBeFalse();

      if (isTestForIgnoringAllFiles) {
        expect(cmdResponse).toEqual([]);
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
      generateConfigGroupStructurePath(mockConfigGroupName),
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
    const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
    const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

    const defaultDestinationPath = expandShellVariablesInString(
      defaultDestinationPathShellStr
    );

    const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

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
    expect(errors).toBeEmpty();
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
      const cmdOutput = await linkCmd(toPositionalArgs(mockConfigGroupNames), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

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
      expect(errors).toBeEmpty();
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
        generateConfigGroupStructurePath(mockConfigGroupName),
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
      const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const configGroupFileNames = getFileNamesFromConfigGroups(configGroups);

      const targetDestinationPathForAllFiles = expandShellVariablesInString(
        matchingGlobDestinationPathShellStr
      );

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationPathsPointToTheSameDir = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(targetDestinationPathForAllFiles, destPath))
      );

      const doAllConfigGroupFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPaths)();

      // Assert
      expect(errors).toBeEmpty();
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
        generateConfigGroupStructurePath(mockConfigGroupName),
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
      const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

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
        getAllDestinationPathsFromConfigGroups(configGroups);

      const directFileNameDestinationPathsWereChosenOverGlobDestPaths = pipe(
        destinationPathsOfTargetedFiles,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(destinationPathForTargetedFiles, destPath))
      );

      const doAllConfigGroupFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPathsForAllFiles)();

      // Assert
      expect(errors).toBeEmpty();
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
        generateConfigGroupStructurePath(
          generateConfigGroupEntityPath(nestedDirName)
        ),
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
      const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

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
      expect(errors).toBeEmpty();
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
        generateConfigGroupStructurePath(
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
      const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const configGroupFileNames = getFileNamesFromConfigGroups(configGroups);

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

      const defaultFileDestinationPath = expandShellVariablesInString(
        mockDestinationPathShellStr
      );

      const doAllFileDestinationPathsPointToTheDefault = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(defaultFileDestinationPath, destPath))
      );

      // Assert
      expect(errors).toBeEmpty();
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
          generateConfigGroupStructurePath(
            generateConfigGroupEntityPath(nestedDirName)
          ),
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
        const cmdOutput = await linkCmd(
          toPositionalArgs([mockConfigGroupName]),
          toCmdOptions(cmdOptions)
        )();

        const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

        const fileRecord = fileRecordLens.get(configGroups[0]);
        const destinationPaths =
          getAllDestinationPathsFromConfigGroups(configGroups);

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
        expect(errors).toBeEmpty();
        expect(allConfigGroupFilesWerePlacedAtDestinationPath).toBeTrue();
        expect(allNestedFilesWerePlacedAtTheirSpecifiedDestinationPath).toBeTrue();
      }
    );

    test('Should ensure that the link command supports deeply nested files within config groups', async () => {
      // Arrange
      const mockConfigGroupName = 'deeplyNested';
      const nestedFileDestinationPathShellStr = '~/rust/sample';

      const mockDestinationsRecord = {
        'inner/sample/sample/sample.rs': nestedFileDestinationPathShellStr,
      };

      const nestedDirName = 'inner/sample/sample';
      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        generateConfigGroupStructurePath(
          generateConfigGroupEntityPath(nestedDirName)
        ),
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
      const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const expectedDestinationPath = expandShellVariablesInString(
        nestedFileDestinationPathShellStr
      );

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

      const nestedFilesPointToTheExpectedDestinationPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(destPath => S.Eq.equals(expectedDestinationPath, destPath))
      );

      const allNestedFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(destinationPaths)();

      // Assert
      expect(errors).toBeEmpty();
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
        generateConfigGroupStructurePath(
          generateConfigGroupEntityPath(nestedDirName)
        ),
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
      const cmdOutput = await linkCmd(toPositionalArgs([mockConfigGroupName]), [])();
      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const ignoredFiles = getIgnoredFilesFromConfigGroups(configGroups);

      const ignoredFilenames = getFileNamesFromFiles(ignoredFiles);
      const ignoredFileDestinationPaths = getDestinationPathsFromFiles(ignoredFiles);

      const allNestedFilesExistAtTheirDestinationPaths =
        await checkIfAllPathsAreValid(ignoredFileDestinationPaths)();

      // Assert
      expect(errors).toBeEmpty();
      expect(allNestedFilesExistAtTheirDestinationPaths).toBeFalse();

      expect(ignoredFilenames).toIncludeSameMembers(
        mockDestinationsRecord[EXCLUDE_KEY]
      );
    });
  });

  describe('Tests for nested config groups', () => {
    test.each([
      ['symlink', []],
      ['hardlink', ['-H']],
      ['copy', ['--copy']],
    ])(
      'Should ensure that the link command can %s files within nested config groups',
      async (_, cmdOptions) => {
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

        const topLevelConfigGroupFileNames = ['sample.js', 'example.rs', 'test.py'];

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
          T.traverseArray(
            compose(createConfigGroupFile, generateConfigGroupEntityPath)
          )
        );

        const mockTopLevelConfigGroupDestinationRecordCreationTask =
          createConfigGroupFile(
            generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
            JSON.stringify(mockDestinationsRecordForTopLevelConfigGroup)
          );

        const mockNestedConfigGroupDestinationRecordCreationTask =
          createConfigGroupFile(
            generateConfigGroupEntityPath(
              path.join(nestedConfigGroupName, CONFIG_GRP_DEST_RECORD_FILE_NAME)
            ),
            JSON.stringify(mockDestinationsRecordForNestedConfigGroup)
          );

        await mockConfigGroupSetupTask();
        await mockConfigGroupFilesCreationTask();
        await mockNestedConfigGroupDestinationRecordCreationTask();
        await mockTopLevelConfigGroupDestinationRecordCreationTask();

        // Act
        const cmdOutput = await linkCmd(
          toPositionalArgs([`${mockConfigGroupName}/${nestedConfigGroupName}`]),
          toCmdOptions(cmdOptions)
        )();

        const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

        const fileNames = getFileNamesFromConfigGroups(configGroups);
        const nestedConfigGroupDestinationPaths =
          getAllDestinationPathsFromConfigGroups(configGroups);
        const expectedDestPathForAllFilesInNestedConfigGroup =
          expandShellVariablesInString(nestedConfigGroupDefaultDestPathShellStr);

        const allNestedConfigGroupDestinationPathsPointToTheExpectedDefault = pipe(
          nestedConfigGroupDestinationPaths,
          A.map(path.dirname),
          A.every(destPath =>
            S.Eq.equals(expectedDestPathForAllFilesInNestedConfigGroup, destPath)
          )
        );

        const allNestedFilesExistAtTheirDestinationPaths =
          await checkIfAllPathsAreValid(nestedConfigGroupDestinationPaths)();

        // Assert
        expect(errors).toBeEmpty();
        expect(allNestedFilesExistAtTheirDestinationPaths).toBeTrue();

        expect(fileNames).toIncludeSameMembers(
          pipe(nestedConfigGroupFileNames, A.map(path.basename))
        );

        expect(
          allNestedConfigGroupDestinationPathsPointToTheExpectedDefault
        ).toBeTrue();
      }
    );

    test('Should ensure that nested config groups have their files and child directories hidden from parent and ancestor config groups', async () => {
      // Arrange
      const mockConfigGroupName = 'nestedConfigGroupAlt';

      const mockDestinationsRecordForTopLevelConfigGroup = {
        [ALL_FILES_CHAR]: '$HOME/.mock/topLevel',
      };

      const mockDestinationsRecordForNestedConfigGroup = {
        [ALL_FILES_CHAR]: '$HOME/.mock/nested',
      };

      const nestedDirName = 'inner';
      const nestedConfigGroupName = 'innerConfigGroup';
      const generateConfigGroupEntityPath = generatePath(mockConfigGroupName);

      const mockConfigGroupSetupTask = pipe(
        [
          pipe(
            generateConfigGroupStructurePath(
              generateConfigGroupEntityPath(nestedConfigGroupName)
            ),
            createDirIfItDoesNotExist
          ),
          pipe(
            generateConfigGroupStructurePath(
              generateConfigGroupEntityPath(nestedDirName)
            ),
            createDirIfItDoesNotExist
          ),
          pipe(
            generateConfigGroupStructurePath(
              generateConfigGroupEntityPath(
                path.join(nestedConfigGroupName, nestedDirName)
              )
            ),
            createDirIfItDoesNotExist
          ),
        ],
        T.sequenceArray
      );

      const _topLevelConfigGroupFileNames = ['sample.js', 'example.rs', 'test.py'];

      const topLevelInnerConfigGroupFileNames = pipe(
        ['index.html', 'test.rs', 'example.md'],
        A.map(filename => path.join(nestedDirName, filename))
      );

      const _nestedConfigGroupFileNames = pipe(
        ['sample.rs', 'index.ts', 'user.md'],
        A.map(filename => path.join(nestedConfigGroupName, filename))
      );

      const nestedInnerConfigGroupFileNames = pipe(
        ['inner.js', 'app.ts', 'readme.md'],
        A.map(filename => path.join(nestedConfigGroupName, nestedDirName, filename))
      );

      const allConfigGroupFileNames = [
        ..._topLevelConfigGroupFileNames,
        ..._nestedConfigGroupFileNames,
        ...topLevelInnerConfigGroupFileNames,
        ...nestedInnerConfigGroupFileNames,
      ];

      const mockConfigGroupFilesCreationTask = pipe(
        allConfigGroupFileNames,
        T.traverseArray(
          compose(createConfigGroupFile, generateConfigGroupEntityPath)
        )
      );

      const mockTopLevelConfigGroupDestinationRecordCreationTask =
        createConfigGroupFile(
          generateConfigGroupEntityPath(CONFIG_GRP_DEST_RECORD_FILE_NAME),
          JSON.stringify(mockDestinationsRecordForTopLevelConfigGroup)
        );

      const mockNestedConfigGroupDestinationRecordCreationTask =
        createConfigGroupFile(
          generateConfigGroupEntityPath(
            path.join(nestedConfigGroupName, CONFIG_GRP_DEST_RECORD_FILE_NAME)
          ),
          JSON.stringify(mockDestinationsRecordForNestedConfigGroup)
        );

      await mockConfigGroupSetupTask();
      await mockConfigGroupFilesCreationTask();
      await mockNestedConfigGroupDestinationRecordCreationTask();
      await mockTopLevelConfigGroupDestinationRecordCreationTask();

      // Act
      const cmdOutput = await linkCmd(
        toPositionalArgs([
          mockConfigGroupName,
          `${mockConfigGroupName}/${nestedConfigGroupName}`,
        ]),
        []
      )();

      const { errors, testOutput: configGroups } = cmdOutput as CmdDataOutput;

      const nestedConfigGroupFileNames = getFileNamesFromConfigGroups([
        configGroups[1],
      ]);

      const topLevelConfigGroupFileNames = getFileNamesFromConfigGroups([
        configGroups[0],
      ]);

      const destinationPaths = getAllDestinationPathsFromConfigGroups(configGroups);

      const allFilesExistAtTheirDestinationPaths = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toBeEmpty();
      expect(allFilesExistAtTheirDestinationPaths).toBeTrue();

      expect(topLevelConfigGroupFileNames).not.toIncludeSameMembers(
        nestedConfigGroupFileNames
      );
    });
  });
});

describe('Tests for everything but the happy path', () => {
  const INVALID_MOCK_CONFIG_GRP_NAMES = pipe(
    ['node', 'spicetify', 'notion', 'cava'],
    toPositionalArgs
  );

  test('Should check that the link command performs no operation if the specified config groups do not exist', async () => {
    // Arrange
    // Act
    const cmdOutput = await linkCmd(INVALID_MOCK_CONFIG_GRP_NAMES, [])();

    const {
      errors,
      output: cmdResponse,
      testOutput: configGroups,
    } = cmdOutput as CmdDataOutput;

    // Assert
    expect([configGroups, cmdResponse]).toEqual([[], []]);

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
      const cmdOutput = await linkCmd(INVALID_MOCK_CONFIG_GRP_NAMES, [])();

      const {
        errors,
        output: cmdResponse,
        testOutput: configGroups,
      } = cmdOutput as CmdDataOutput;

      // Assert
      expect(errors.length).toBeGreaterThanOrEqual(mockConfigGroupNames.length);
      expect([configGroups, cmdResponse]).toEqual([[], []]);

      // Cleanup
      process.env.DOTS = MOCK_DOTS_DIR;
      process.env.DOTFILES = MOCK_DOTS_DIR;
    }
  );

  test('Should ensure that the link command exits gracefully should we decline to operate on all config groups', async () => {
    // Arrange
    prompts.inject([false]);

    // Act
    const cmdOutput = (await linkCmd([], [])()) as ProcessExitFn;
    cmdOutput();

    // Assert
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.OK);
  });
});
