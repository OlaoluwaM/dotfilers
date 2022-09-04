import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import prompts from 'prompts';

import { pipe } from 'fp-ts/lib/function';
import { File } from '@types';
import { concatAll } from 'fp-ts/lib/Monoid';
import { default as linkCmd } from '@cmds/link';
import { MonoidAll, MonoidAny } from 'fp-ts/lib/boolean';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { getFilesFromConfigGrp } from '@app/configGrpOps';
import { compose, lensProp, view } from 'ramda';
import { getAllDirNamesAtFolderPath } from '@utils/index';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { ExitCodes, SHELL_VARS_TO_CONFIG_GRP_DIRS } from '../src/constants';
import {
  isSymlink,
  isHardlink,
  manualFail,
  doesPathExist,
  checkIfAllPathsAreValid,
  getDestinationPathFromFileObj,
  getDestinationPathsFromConfigGrp,
  getDestinationPathsOfIgnoredFiles,
} from './helpers';

const LINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/link`;
const LINK_TEST_ASSERT_DIR = `${LINK_TEST_DATA_DIR}/mock-home`;

beforeAll(() => {
  process.env.HOME = LINK_TEST_ASSERT_DIR;

  process.env.DOTS = `${LINK_TEST_DATA_DIR}/mock-dots`;
  process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/mock-dots`;
});

function getSourceAndDestinationPathsFromFileObj(configGrpFileObj: File) {
  return [
    getSourcePathFromFileObj(configGrpFileObj),
    getDestinationPathFromFileObj(configGrpFileObj),
  ] as [string, string];
}

function getSourcePathFromFileObj(configGrpFileObj: File) {
  const destinationPathLens = lensProp<File, 'path'>('path');
  return view(destinationPathLens, configGrpFileObj);
}

const VALID_MOCK_CONFIG_GRP_NAMES = ['npm', 'bat', 'neovim', 'git'];

describe('Tests for the happy path', () => {
  test(`Should ensure that link command correctly creates symlinks of files at their intended destinations when both ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} and ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variables are set`, async () => {
    // Arrange
    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: outputForTests,
    } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

    const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTruthy();
    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
      VALID_MOCK_CONFIG_GRP_NAMES.length
    );
  });

  test(`Should ensure that link command correctly creates symlinks of files at their intended destinations when only the ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} variable is set`, async () => {
    // Arrange
    process.env.DOTS = '';

    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: outputForTests,
    } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

    const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTruthy();
    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
      VALID_MOCK_CONFIG_GRP_NAMES.length
    );

    // Cleanup
    process.env.DOTS = process.env.DOTFILES;
  });

  test(`Should ensure that link command correctly creates symlinks of files at their intended destinations when only the ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variable is set`, async () => {
    // Arrange
    process.env.DOTFILES = '';

    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: outputForTests,
    } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

    const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTruthy();
    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
      VALID_MOCK_CONFIG_GRP_NAMES.length
    );

    // Cleanup
    process.env.DOTFILES = process.env.DOTS;
  });

  test.each([['--hardlink'], ['-H']])(
    'Should ensure that link command hardlinks files to their destination instead of symlinking if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: outputForTests,
      } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, [mockOptions]);

      const sourceAndDestinationPaths = pipe(
        outputForTests,
        A.map(
          compose(
            A.map(getSourceAndDestinationPathsFromFileObj),
            getFilesFromConfigGrp
          )
        ),
        A.flatten
      );

      const doAllDestinationHardlinksExist = await pipe(
        sourceAndDestinationPaths,
        A.map(
          ([sourcePath, destinationPath]) =>
            () =>
              isHardlink(sourcePath, destinationPath)
        ),
        T.sequenceArray,
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
        forTest: outputForTests,
      } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, [mockOptions]);

      const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

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
      forTest: outputForTests,
    } = await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES, ['-H', '--copy']);

    const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
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
    ['hardlinking', ['-H', '--hardlink']],
    ['copying', ['-c', '--copy']],
  ])(
    'Should ensure that the link command defaults to %s files of all config groups to their destinations if no config group is explicitly specified',
    async (_, mockOptions) => {
      // Arrange
      process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/valid-mock-dots`;
      process.env.DOTS = `${LINK_TEST_DATA_DIR}/valid-mock-dots`;

      prompts.inject([true]);

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: outputForTests,
      } = await linkCmd([], mockOptions);

      const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

      const doAllDestinationPathsExist = await pipe(
        destinationPaths,
        A.map(destinationPath => () => doesPathExist(destinationPath)),
        T.sequenceArray,
        T.map(concatAll(MonoidAll))
      )();

      const numberOfDirectoriesInDotfilesFolder = await pipe(
        process.env.DOTFILES,
        getAllDirNamesAtFolderPath,
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
    async (testDescription, mockConfigGrpNames) => {
      // Arrange
      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: outputForTests,
      } = await linkCmd(mockConfigGrpNames);

      const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);
      const destinationPathsOfIgnoredFilesOnly =
        getDestinationPathsOfIgnoredFiles(outputForTests);

      const doThoseNonIgnoredDestinationSymlinksExist = await pipe(
        destinationPaths,
        A.map(destinationPath => () => isSymlink(destinationPath)),
        T.sequenceArray,
        T.map(concatAll(MonoidAny))
      )();

      const isTestForIgnoringAllFiles = testDescription.includes('all');

      // Assert
      expect(errors).toEqual([]);

      if (isTestForIgnoringAllFiles) {
        expect(actualCmdOutput).toEqual([]);
        expect(doThoseNonIgnoredDestinationSymlinksExist).toBeFalsy();
      } else {
        expect(doThoseNonIgnoredDestinationSymlinksExist).toBeTruthy();

        const numberOfOperatedOnFiles =
          destinationPaths.length - destinationPathsOfIgnoredFilesOnly.length;

        expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
          numberOfOperatedOnFiles
        );
      }
    }
  );

  test(`Should ensure that link command operates successfully when all files in config group are directed to the same destination path`, async () => {
    // Arrange
    const mockConfigGrpNames = ['withAllDotsToOneLoc'];

    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: outputForTests,
    } = await linkCmd(mockConfigGrpNames);

    const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(errors).toEqual([]);
    expect(doAllDestinationSymlinksExist).toBeTruthy();
    expect(actualCmdOutput.length).toBeGreaterThanOrEqual(mockConfigGrpNames.length);
  });

  test.each([
    ['', ['tilix']],
    [
      'even if destination record file has entries with some invalid destination path values',
      ['withPathIssues'],
    ],
  ])(
    `Should ensure that by default, all files in a config group have a destination path of the $HOME directory %s`,
    async (_, mockConfigGrpNames) => {
      // Arrange
      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: outputForTests,
      } = await linkCmd(mockConfigGrpNames);

      const destinationPaths = getDestinationPathsFromConfigGrp(outputForTests);

      const doAllDestinationSymlinksExist = await pipe(
        destinationPaths,
        A.map(destinationPath => () => isSymlink(destinationPath)),
        T.sequenceArray,
        T.map(concatAll(MonoidAll))
      )();

      const allDestinationPathsPointToTheHomeDirectory = pipe(
        destinationPaths,
        A.map(path.dirname),
        A.every(S.includes(process.env.HOME!))
      );

      // Assert
      expect(errors).toEqual([]);
      expect(doAllDestinationSymlinksExist).toBeTruthy();
      expect(allDestinationPathsPointToTheHomeDirectory).toBeTruthy();
      expect(actualCmdOutput.length).toBeGreaterThanOrEqual(
        mockConfigGrpNames.length
      );
    }
  );
});

describe('Tests for everything but the happy path', () => {
  const INVALID_MOCK_CONFIG_GRP_NAMES = ['node', 'spicetify', 'notion', 'cava'];

  test('Should check that the link command performs no operation if the specified config groups do not exist', async () => {
    // Arrange
    // Act
    const {
      errors,
      output: actualCmdOutput,
      forTest: outputForTests,
    } = await linkCmd(INVALID_MOCK_CONFIG_GRP_NAMES);

    // Assert
    expect([outputForTests, actualCmdOutput]).toEqual([[], []]);
    expect(errors.length).toBeGreaterThanOrEqual(
      INVALID_MOCK_CONFIG_GRP_NAMES.length
    );
  });

  test.each([
    ['invalid', INVALID_MOCK_CONFIG_GRP_NAMES],
    ['valid', VALID_MOCK_CONFIG_GRP_NAMES],
  ])(
    'Should check that the link command fails gracefully if the necessary environment variables were not set and we were to supply %s config group names',
    async (_, mockConfigGrpNames) => {
      // Arrange
      const PREV_DOTFILES_ENV_VAR_VALUE = process.env.DOTFILES;

      process.env.DOTS = '';
      process.env.DOTFILES = '';

      // Act
      const {
        errors,
        output: actualCmdOutput,
        forTest: outputForTests,
      } = await linkCmd(mockConfigGrpNames);

      // Assert
      expect([outputForTests, actualCmdOutput]).toEqual([[], []]);
      expect(errors.length).toBeGreaterThanOrEqual(mockConfigGrpNames.length);

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
