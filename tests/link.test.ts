import * as T from 'fp-ts/lib/Task';
import * as A from 'fp-ts/lib/Array';
import * as S from 'fp-ts/lib/string';

import path from 'path';
import prompts from 'prompts';
import { default as linkCmd } from '@cmds/link';

import { pipe } from 'fp-ts/lib/function';
import { concatAll } from 'fp-ts/lib/Monoid';
import { ConfigGroup, ConfigGroups, File } from '@types';
import { MonoidAll, MonoidAny } from 'fp-ts/lib/boolean';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { compose, lensProp, view } from 'ramda';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { doesPathExist, isHardlink, isSymlink } from './helpers';
import { ExitCodes, SHELL_VARS_TO_CONFIG_GRP_DIRS } from '../src/constants';

const LINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/link`;
const LINK_TEST_ASSERT_DIR = `${LINK_TEST_DATA_DIR}/mock-home`;

beforeAll(() => {
  process.env.HOME = LINK_TEST_ASSERT_DIR;

  process.env.DOTS = `${LINK_TEST_DATA_DIR}/mock-dots`;
  process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/mock-dots`;
});

function getFilesFromConfigGrp(configGrpObj: ConfigGroup) {
  const filesLens = lensProp<ConfigGroup, 'files'>('files');
  return view(filesLens, configGrpObj);
}

function getDestinationPathFromFileObj(configGrpFileObj: File) {
  const destinationPathLens = lensProp<File, 'destinationPath'>('destinationPath');
  return view(destinationPathLens, configGrpFileObj);
}

function getSourcePathFromFileObj(configGrpFileObj: File) {
  const destinationPathLens = lensProp<File, 'path'>('path');
  return view(destinationPathLens, configGrpFileObj);
}

const getSourceAndDestinationPathsFromFileObj = (configGrpFileObj: File) =>
  [
    getSourcePathFromFileObj(configGrpFileObj),
    getDestinationPathFromFileObj(configGrpFileObj),
  ] as [string, string];

export function getDestinationPathsFromConfigGrpsArr(configGrps: ConfigGroups) {
  return pipe(
    configGrps,
    A.map(compose(A.map(getDestinationPathFromFileObj), getFilesFromConfigGrp)),
    A.flatten
  );
}

const validConfigGrpNames = ['npm', 'bat', 'neovim', 'git'];

describe('Tests for the happy path', () => {
  test(`Should ensure that symlinks are correctly created at intended destinations with both ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} and ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variables set`, async () => {
    // Arrange
    // Act
    const output = await linkCmd(validConfigGrpNames, []);

    const destinationPaths = getDestinationPathsFromConfigGrpsArr(output);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(doAllDestinationSymlinksExist).toBeTruthy();
  });

  test(`Should ensure that symlinks are correctly created at intended destinations with only the ${SHELL_VARS_TO_CONFIG_GRP_DIRS[0]} variable set`, async () => {
    // Arrange
    process.env.DOTS = '';

    // Act
    const output = await linkCmd(validConfigGrpNames, []);

    const destinationPaths = getDestinationPathsFromConfigGrpsArr(output);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(doAllDestinationSymlinksExist).toBeTruthy();

    // Cleanup
    process.env.DOTS = process.env.DOTFILES;
  });

  test(`Should ensure that symlinks are correctly created at intended destinations with only the ${SHELL_VARS_TO_CONFIG_GRP_DIRS[1]} variable set`, async () => {
    // Arrange
    process.env.DOTFILES = '';

    // Act
    const output = await linkCmd(validConfigGrpNames, []);

    const destinationPaths = getDestinationPathsFromConfigGrpsArr(output);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(doAllDestinationSymlinksExist).toBeTruthy();

    // Cleanup
    process.env.DOTFILES = process.env.DOTS;
  });

  test.each([['--hardlink'], ['-H']])(
    'Should ensure that hardlinks can be used instead of symlinks if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const output = await linkCmd(validConfigGrpNames, [mockOptions]);

      const sourceAndDestinationPaths = pipe(
        output,
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
      expect(doAllDestinationHardlinksExist).toBeTruthy();
    }
  );

  test.each([['--copy'], ['-c']])(
    'Should ensure that copy can be created instead of a symlink if we supply the %s option',
    async mockOptions => {
      // Arrange
      // Act
      const output = await linkCmd(validConfigGrpNames, [mockOptions]);

      const destinationPaths = pipe(
        output,
        A.map(compose(A.map(getDestinationPathFromFileObj), getFilesFromConfigGrp)),
        A.flatten
      );

      const doAllDestinationFilesExist = await pipe(
        destinationPaths,
        A.map(destinationPath => () => doesPathExist(destinationPath)),
        T.sequenceArray,
        T.map(concatAll(MonoidAll))
      )();

      // Assert
      expect(doAllDestinationFilesExist).toBeTruthy();
    }
  );

  test('Should ensure that command defaults to symlinks should clashing options be supplied (--hardlink and --copy)', async () => {
    // Arrange
    // Act
    const output = await linkCmd(validConfigGrpNames, ['-H', '--copy']);

    const destinationPaths = getDestinationPathsFromConfigGrpsArr(output);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(doAllDestinationSymlinksExist).toBeTruthy();
  });

  test.each([
    ['symlinking', []],
    ['hardlinking', ['-H', '--hardlink']],
    ['copying', ['-c', '--copy']],
  ])(
    'Should ensure that command defaults to %s all config groups if none are specified',
    async (_, mockOptions) => {
      // Arrange
      process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/valid-mock-dots`;
      process.env.DOTS = `${LINK_TEST_DATA_DIR}/valid-mock-dots`;

      prompts.inject([true]);

      // Act
      const output = await linkCmd([], mockOptions);

      const destinationPaths = pipe(
        output,
        A.map(compose(A.map(getDestinationPathFromFileObj), getFilesFromConfigGrp)),
        A.flatten
      );

      const doAllDestinationPathsExist = await pipe(
        destinationPaths,
        A.map(destinationPath => () => doesPathExist(destinationPath)),
        T.sequenceArray,
        T.map(concatAll(MonoidAll))
      )();

      // Assert
      expect(doAllDestinationPathsExist).toBeTruthy();

      // Cleanup
      process.env.DOTS = `${LINK_TEST_DATA_DIR}/mock-dots`;
      process.env.DOTFILES = `${LINK_TEST_DATA_DIR}/mock-dots`;
    }
  );

  test.each([
    ['does nothing if all files in config group are ignored', ['withAllIgnored']],
    ['only operates on those files that are not being ignored', ['withSomeIgnored']],
  ])(
    `Should ensure that command %s`,
    async (testDescription, mockConfigGrpNames) => {
      // Arrange
      // Act
      const output = await linkCmd(mockConfigGrpNames, []);

      const destinationPaths = pipe(
        output,
        A.map(compose(A.map(getDestinationPathFromFileObj), getFilesFromConfigGrp)),
        A.flatten
      );

      const doAllDestinationSymlinksExist = await pipe(
        destinationPaths,
        A.map(destinationPath => () => isSymlink(destinationPath)),
        T.sequenceArray,
        T.map(concatAll(MonoidAny))
      )();

      // Assert
      const isTestForIgnoringAllFiles = testDescription.includes('all');

      if (isTestForIgnoringAllFiles) {
        expect(doAllDestinationSymlinksExist).toBeFalsy();
      } else expect(doAllDestinationSymlinksExist).toBeTruthy();
    }
  );

  test(`Should ensure that command operates successfully when all files in config group are directed to the same destination path`, async () => {
    // Arrange
    const mockConfigGrpNames = ['withAllDotsToOneLoc'];

    // Act
    const output = await linkCmd(mockConfigGrpNames, []);

    const destinationPaths = getDestinationPathsFromConfigGrpsArr(output);

    const doAllDestinationSymlinksExist = await pipe(
      destinationPaths,
      A.map(destinationPath => () => isSymlink(destinationPath)),
      T.sequenceArray,
      T.map(concatAll(MonoidAll))
    )();

    // Assert
    expect(doAllDestinationSymlinksExist).toBeTruthy();
  });

  test.each([
    ['', ['tilix']],
    [
      'even if destination record file has entries with invalid destination paths',
      ['withPathIssues'],
    ],
  ])(
    `Should ensure that by default, all files in a config group have a destination path of the $HOME directory %s`,
    async (_, mockConfigGrpNames) => {
      // Arrange
      // Act
      const output = await linkCmd(mockConfigGrpNames, []);

      const destinationPaths = getDestinationPathsFromConfigGrpsArr(output);

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
      expect(allDestinationPathsPointToTheHomeDirectory).toBeTruthy();
      expect(doAllDestinationSymlinksExist).toBeTruthy();
    }
  );
});

describe('Tests for everything but the happy path', () => {
  const invalidConfigGrpNames = ['node', 'spicetify', 'notion', 'cava'];
  test('Should check that no operation is performed if configuration group names do not exist', async () => {
    // Arrange
    // Act
    const output = await linkCmd(invalidConfigGrpNames, []);

    // Assert
    expect(output).toEqual([]);
  });

  test.each([
    ['invalid', invalidConfigGrpNames],
    ['valid', validConfigGrpNames],
  ])(
    'Should check that command fails gracefully should the necessary env variables be unset and we were to supply %s config group names',
    async (_, mockConfigGrpNames) => {
      // Arrange
      const PREV_DOTFILES_ENV_VAR_VALUE = process.env.DOTFILES;

      process.env.DOTFILES = '';
      process.env.DOTS = '';

      // Act
      const output = await linkCmd(mockConfigGrpNames, []);

      // Assert
      expect(output).toEqual([]);

      // Cleanup
      process.env.DOTFILES = PREV_DOTFILES_ENV_VAR_VALUE;
      process.env.DOTS = PREV_DOTFILES_ENV_VAR_VALUE;
    }
  );

  test('Should ensure that command exits gracefully should we decline to operate on all config groups', async () => {
    // Arrange
    prompts.inject([false]);

    // Act
    await linkCmd([], []);

    // Assert
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.OK);
  });
});
