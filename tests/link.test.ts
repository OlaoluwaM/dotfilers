import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as R from 'fp-ts/lib/Record';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import isGlob from 'is-glob';
import prompts from 'prompts';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { concatAll } from 'fp-ts/lib/Monoid';
import { default as linkCmd } from '@cmds/link';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { getFilesFromConfigGroup } from '@app/configGroup';
import { compose, lensProp, view } from 'ramda';
import { getAllConfigGroupDirPaths } from '@app/helpers';
import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { ConfigGroup, DestinationPath, File, SourcePath } from '@types';
import {
  ExitCodes,
  ALL_FILES_CHAR,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
} from '../src/constants';
import {
  isSymlink,
  isHardlink,
  manualFail,
  doesPathExist,
  checkIfAllPathsAreValid,
  readRawDestinationRecordFile,
  getDestinationPathFromFileObj,
  getDestinationPathsFromConfigGroups,
  getDestinationPathsOfNonIgnoredFiles,
  getDestinationPathsOfIgnoredFiles,
} from './helpers';

const LINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/link`;
const LINK_TEST_ASSERT_DIR = `${LINK_TEST_DATA_DIR}/mock-home`;

beforeAll(() => {
  process.env.HOME = LINK_TEST_ASSERT_DIR;

  process.env.DOTS = `${LINK_TEST_DATA_DIR}/mock-dots`;
  process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/mock-dots`;
});

function getSourceAndDestinationPathsFromFileObj(configGroupFileObj: File) {
  return [
    getSourcePathFromFileObj(configGroupFileObj),
    getDestinationPathFromFileObj(configGroupFileObj),
  ] as [SourcePath, DestinationPath];
}

function getSourcePathFromFileObj(configGroupFileObj: File) {
  const destinationPathLens = lensProp<File, 'sourcePath'>('sourcePath');
  return view(destinationPathLens, configGroupFileObj);
}

const VALID_MOCK_CONFIG_GRP_NAMES = ['npm', 'bat', 'neovim', 'git'];

describe('Tests for the happy path', () => {
  test(`Should ensure that link command correctly creates symlinks of files at their intended destinations when both ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} and ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variables are set`, async () => {
    // Arrange
    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: configGroups,
    } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

    const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTruthy();

    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
      VALID_MOCK_CONFIG_GRP_NAMES.length
    );
  });

  test.each([['DOTS'], ['DOTFILES']])(
    `Should ensure that link command correctly creates symlinks of files at their intended destinations when only the %s variable is set`,
    async envVarName => {
      // Arrange
      process.env[envVarName] = '';

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationSymlinksExist = await pipe(
        destinationPaths,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationSymlinksExist).toBeTruthy();

      expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
        VALID_MOCK_CONFIG_GRP_NAMES.length
      );

      // Cleanup
      process.env[envVarName] = `${LINK_TEST_DATA_DIR}/mock-dots`;
    }
  );

  test.each([['--hardlink'], ['-H']])(
    'Should ensure that link command hardlinks files to their destination instead of symlinking if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, [mockOptions]);

      const sourceAndDestinationPaths = pipe(
        configGroups,
        A.chain(
          compose(
            A.map(getSourceAndDestinationPathsFromFileObj),
            getFilesFromConfigGroup
          )
        )
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
      expect(doAllDestinationHardlinksExist).toBeTruthy();

      expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
        VALID_MOCK_CONFIG_GRP_NAMES.length
      );
    }
  );

  test.each([['--copy'], ['-c']])(
    'Should ensure that link command copies files to their destination instead of symlinking them if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, [mockOptions]);

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationFilesExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationFilesExist).toBeTruthy();

      expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
        VALID_MOCK_CONFIG_GRP_NAMES.length
      );
    }
  );

  test('Should ensure that the link command defaults to symlinking files to their destinations should clashing options be supplied (--hardlink and --copy)', async () => {
    // Arrange
    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: configGroups,
    } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, ['-H', '--copy']);

    const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTruthy();

    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
      VALID_MOCK_CONFIG_GRP_NAMES.length
    );
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
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd([], mockOptions);

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const doAllDestinationPathsExist = await pipe(
        destinationPaths,
        T.traverseArray(destinationPath => () => doesPathExist(destinationPath)),
        T.map(concatAll(MonoidAll))
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
        E.chainFirstW(() =>
          E.right(expect(doAllDestinationPathsExist).toBeTruthy())
        ),
        E.fold(manualFail, expect(actualCmdOutput.length).toBeGreaterThanOrEqual)
      );

      // Cleanup
      process.env.DOTS = `${LINK_TEST_DATA_DIR}/mock-dots`;
      process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/mock-dots`;
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

      const destinationPathsOfNonIgnoredFilesOnly =
        getDestinationPathsOfNonIgnoredFiles(configGroups);

      const destinationPathsOfIgnoredFilesOnly =
        getDestinationPathsOfIgnoredFiles(configGroups);

      const wereAllNonIgnoredFilesSymlinked = await pipe(
        destinationPathsOfNonIgnoredFilesOnly,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      const wereAllIgnoredFilesSymlinked = await pipe(
        destinationPathsOfIgnoredFilesOnly,
        T.traverseArray(destinationPath => () => isSymlink(destinationPath)),
        T.map(concatAll(MonoidAll))
      )();

      const isTestForIgnoringAllFiles = testDescription.includes('all');

      // Assert
      expect(errors).toEqual([]);
      expect(wereAllIgnoredFilesSymlinked).toBeFalsy();

      if (isTestForIgnoringAllFiles) {
        expect(actualCmdOutput).toEqual([]);
        expect(destinationPathsOfNonIgnoredFilesOnly).toEqual([]);
      } else {
        expect(wereAllNonIgnoredFilesSymlinked).toBeTruthy();

        expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
          destinationPathsOfNonIgnoredFilesOnly.length
        );
      }
    }
  );

  test(`Should ensure that link command operates successfully when all files in config group are directed to the same destination path`, async () => {
    // Arrange
    const mockConfigGroupNames = ['withAllDotsToOneLoc'];

    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: configGroups,
    } = await linkCmd(mockConfigGroupNames);

    const defaultDestinationPath = configGroups[0].destinationRecord[ALL_FILES_CHAR];

    const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

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
    expect(doAllDestinationSymlinksExist).toBeTruthy();
    expect(doAllDestinationPathsPointToTheDefault).toBeTruthy();

    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
      mockConfigGroupNames.length
    );
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
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

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
      expect(doAllDestinationSymlinksExist).toBeTruthy();
      expect(allDestinationPathsPointToHomeDirectory).toBeTruthy();

      expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
        mockConfigGroupNames.length
      );
    }
  );

  describe.skip('Tests for glob support', () => {
    test('Should ensure that the link command can correctly match and operate on glob patterns (even if there are conflicting glob patterns. It should pick the associated path to the first matching glob pattern as listed in the destination record file)', async () => {
      // Arrange
      const mockConfigGroupNames = ['withGlobsOnly'];

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const destinationRecordLens = lensProp<ConfigGroup, 'destinationRecord'>(
        'destinationRecord'
      );

      const destinationRecordWithExpandedPathValues = pipe(
        configGroups[0],
        view(destinationRecordLens)
      );

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const areAllDestinationPathsEqualToJsExtGlobPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(
          pathStr => pathStr === destinationRecordWithExpandedPathValues['*.js']
        )
      );

      const doAllDestinationPathsExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(actualCmdOutput.length).toBeGreaterThan(1);
      expect(doAllDestinationPathsExist).toBeTruthy();
      expect(areAllDestinationPathsEqualToJsExtGlobPath).toBeTruthy();
      expect(R.size(destinationRecordWithExpandedPathValues)).toBeGreaterThanOrEqual(
        2
      );
    });

    test('Should ensure that the link command prioritizes direct filename destinations over glob destinations', async () => {
      // Arrange
      const mockConfigGroupNames = ['mcfly'];

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const destinationRecordLens = lensProp<ConfigGroup, 'destinationRecord'>(
        'destinationRecord'
      );

      const destinationRecordWithExpandedPathValues = pipe(
        configGroups[0],
        view(destinationRecordLens)
      );

      const destinationRecordWithNoGlobKeys = pipe(
        destinationRecordWithExpandedPathValues,
        R.filterWithIndex(not(isGlob))
      );

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const areAllDestinationPathsEqualToJsExtGlobPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(
          pathStr => pathStr === destinationRecordWithExpandedPathValues['*.js']
        )
      );

      const numOfDestinationPathsNotEqualToJsExtGlobPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.filter(
          pathStr => pathStr !== destinationRecordWithExpandedPathValues['*.js']
        ),
        A.size
      );

      const doAllDestinationPathsExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(actualCmdOutput.length).toBeGreaterThan(1);
      expect(doAllDestinationPathsExist).toBeTruthy();
      expect(areAllDestinationPathsEqualToJsExtGlobPath).toBeFalsy();
      expect(numOfDestinationPathsNotEqualToJsExtGlobPath).toBe(
        R.size(destinationRecordWithNoGlobKeys)
      );
    });

    test('Should ensure that the link command allows for ignoring using glob pattern', async () => {
      // Arrange
      const mockConfigGroupNames = ['withIgnoreGlobs'];

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const destinationRecordLens = lensProp<ConfigGroup, 'destinationRecord'>(
        'destinationRecord'
      );

      const destinationRecordWithExpandedPathValues = pipe(
        configGroups[0],
        view(destinationRecordLens)
      );

      const destinationRecordWithNoGlobKeys = pipe(
        destinationRecordWithExpandedPathValues,
        R.filterWithIndex(not(isGlob))
      );

      const destinationPaths = getDestinationPathsFromConfigGroups(configGroups);

      const areAllDestinationPathsEqualToJsExtGlobPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(
          pathStr => pathStr === destinationRecordWithExpandedPathValues['*.js']
        )
      );

      const numOfDestinationPathsNotEqualToJsExtGlobPath = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.filter(
          pathStr => pathStr !== destinationRecordWithExpandedPathValues['*.js']
        ),
        A.size
      );

      const doAllDestinationPathsExist = await checkIfAllPathsAreValid(
        destinationPaths
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(actualCmdOutput.length).toBeGreaterThan(1);
      expect(doAllDestinationPathsExist).toBeTruthy();
      expect(areAllDestinationPathsEqualToJsExtGlobPath).toBeFalsy();
      expect(numOfDestinationPathsNotEqualToJsExtGlobPath).toBe(
        R.size(destinationRecordWithNoGlobKeys)
      );
    });
  });

  describe('Tests for nested files support', () => {
    test.each([
      ['symlink', []],
      ['copy', ['-c']],
      ['hardlink', ['-H']],
    ])(
      'Should ensure that the link command can %s nested files',
      async (_, cmdOptions) => {
        // Arrange
        const mockConfigGroupNames = ['nested'];
        const configGroupDestinationRecord = await readRawDestinationRecordFile(
          mockConfigGroupNames[0]
        );

        const targetFileNames = ['inner/user.css', 'inner/sample.js', 'user.css'];

        const expectedDestinationPathsForTargetFiles = pipe(
          targetFileNames,
          A.map(
            compose(
              expandShellVariablesInString,
              fileName => configGroupDestinationRecord[fileName]
            )
          )
        );

        // Act
        const {
          errors,
          output: actualCmdOutput,
          forTest: configGroups,
        } = await linkCmd(mockConfigGroupNames, cmdOptions);

        const { fileRecord } = configGroups[0];

        const actualDestinationPathsForTargetFiles = pipe(
          targetFileNames,
          A.map(
            compose(path.dirname, fileName => fileRecord[fileName].destinationPath)
          )
        );

        // Assert
        expect(errors).toEqual([]);
        expect(actualCmdOutput.length).toBeGreaterThan(targetFileNames.length);
        expect(actualDestinationPathsForTargetFiles).toEqual(
          expectedDestinationPathsForTargetFiles
        );
      }
    );

    test('Should ensure that the link command supports deeply nested config groups', async () => {
      // Arrange
      const mockConfigGroupNames = ['deeplyNested'];
      const configGroupDestinationRecord = await readRawDestinationRecordFile(
        mockConfigGroupNames[0]
      );

      const targetFileNames = ['inner/sample/sample/sample.rs', 'sample.rs'];

      const expectedDestinationPathsForTargetFiles = pipe(
        targetFileNames,
        A.map(
          compose(
            expandShellVariablesInString,
            fileName => configGroupDestinationRecord[fileName]
          )
        )
      );

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const { fileRecord } = configGroups[0];

      const actualDestinationPathsForTargetFiles = pipe(
        targetFileNames,
        A.map(
          compose(path.dirname, fileName => fileRecord[fileName].destinationPath)
        )
      );

      // Assert
      expect(errors).toEqual([]);
      expect(actualCmdOutput.length).toBe(targetFileNames.length);
      expect(actualDestinationPathsForTargetFiles).toEqual(
        expectedDestinationPathsForTargetFiles
      );
    });

    test('Should ensure that the link command can ignore nested files in a config grp', async () => {
      // Arrange
      const mockConfigGroupNames = ['nestedIgnore'];

      const targetFileName = 'inner/example.js';

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      const { fileRecord } = configGroups[0];

      const targetFileWasNotIgnored = await pipe(
        targetFileName,
        compose(doesPathExist, fileName => fileRecord[fileName].destinationPath)
      );

      // Assert
      expect(errors).toEqual([]);
      expect(targetFileWasNotIgnored).toBeFalsy();
      expect(actualCmdOutput.length).toBe(R.size(fileRecord) - 1);
    });

    test.todo('Does nesting work with globs');

    test.todo('What happens if a nested key starts with a leading slash');

    test.todo('Can I work with a nested config group like a normal config group');
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
      const PREV_DOTFILES_ENV_VAR_VALUE = process.env.DOTFILES;

      process.env.DOTS = '';
      process.env.DOTFILES = '';

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: configGroups,
      } = await linkCmd(mockConfigGroupNames);

      // Assert
      expect([configGroups, actualCmdOutput]).toEqual([[], []]);
      expect(errors.length).toBeGreaterThanOrEqual(mockConfigGroupNames.length);

      // Cleanup
      process.env.DOTS = PREV_DOTFILES_ENV_VAR_VALUE;
      process.env.DOTFILES = PREV_DOTFILES_ENV_VAR_VALUE;
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
