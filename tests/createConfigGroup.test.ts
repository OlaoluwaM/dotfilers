/* globals expect, describe, test, beforeAll */

import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import fsExtra from 'fs-extra';

import { rm } from 'fs/promises';
import { pipe } from 'fp-ts/lib/function';
import { concatAll } from 'fp-ts/lib/Monoid';
import { MonoidAny } from 'fp-ts/lib/boolean';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { toCmdOptions, toPositionalArgs } from '@types';
import { default as createConfigGroupCmd } from '@cmds/createConfigGroup';
import { DEFAULT_DEST_RECORD_FILE_CONTENTS } from '@app/configGroup';
import {
  manualFail,
  generatePath,
  doesPathExist,
  defaultDestRecordEq,
} from './helpers';
import {
  ExitCodes,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../src/constants';

const CMD_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/create-config-grp`;

const MOCK_DOTS_DIR = `${CMD_TEST_DATA_DIR}/mock-dots`;

beforeAll(() => {
  process.env.DOTS = MOCK_DOTS_DIR;
  process.env.DOTFILES = MOCK_DOTS_DIR;
});

const generateConfigGroupStructurePath = generatePath(MOCK_DOTS_DIR);

function diffDestinationRecordFile(pathToDestinationRecord: string) {
  return async () => {
    try {
      const output = await fsExtra.readJSON(pathToDestinationRecord);
      return defaultDestRecordEq.equals(output, DEFAULT_DEST_RECORD_FILE_CONTENTS);
    } catch {
      return false;
    }
  };
}

async function removeDirs(dirNames: string[]) {
  return await pipe(
    dirNames,
    A.map(generateConfigGroupStructurePath),
    T.traverseArray(dirPath => () => rm(dirPath, { force: true, recursive: true }))
  )();
}

const NAMES_OF_EXISTING_CONFIG_GRPS = ['bat', 'git', 'cava', 'npm'];

describe('Tests for the happy path', () => {
  test.each([
    ['DOTS', ['spicetify', 'btop', 'mcfly']],
    ['DOTFILES', ['node', 'tilix', 'neovim', 'fzf']],
  ])(
    'Should ensure that the createConfigGroup command can create config groups with default destination record files even if one (%s) of the two mutually exclusive environment variables is not set',
    async (envVarName, nonExistingConfigGroupNames) => {
      // Arrange
      process.env[envVarName] = '';

      // Act
      const cmdOutputTE = createConfigGroupCmd(
        toPositionalArgs(
          nonExistingConfigGroupNames.concat(NAMES_OF_EXISTING_CONFIG_GRPS)
        ),
        []
      );

      // Assert
      await pipe(
        cmdOutputTE,

        TE.bindW('numOfCreatedConfigGroups', ({ testOutput }) =>
          pipe(
            testOutput,
            T.traverseArray(configGroupDirPath =>
              pipe(
                path.join(configGroupDirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME),
                diffDestinationRecordFile
              )
            ),
            T.map(RA.filter(Boolean)),
            T.map(RA.size),
            TE.rightTask
          )
        ),

        TE.fold(
          () => () =>
            Promise.reject(
              manualFail(
                "Expected a 'CmdResponse' object, but got a CLI exit function"
              )
            ),

          ({ errors, warnings, numOfCreatedConfigGroups }) =>
            async () => {
              expect(errors).toBeEmpty();
              expect(warnings).toBeArrayOfSize(NAMES_OF_EXISTING_CONFIG_GRPS.length);

              expect(numOfCreatedConfigGroups).toBe(
                nonExistingConfigGroupNames.length
              );
            }
        )
      )();

      // Cleanup
      process.env[envVarName] = MOCK_DOTS_DIR;
      await removeDirs(nonExistingConfigGroupNames);
    }
  );

  test('Should ensure that the createConfigGroup command can create nested config groups', async () => {
    // Arrange
    const nameOfMockNestedConfigGroup = 'bat/inner';
    const expectedPathToNestedConfigGroup = generateConfigGroupStructurePath(
      nameOfMockNestedConfigGroup
    );

    // Act
    const cmdOutputTE = createConfigGroupCmd(
      toPositionalArgs([nameOfMockNestedConfigGroup]),
      []
    );

    // Assert
    await pipe(
      cmdOutputTE,

      TE.bindW('nestedConfigGroupHasValidDefaultDestinationRecordFile', () =>
        pipe(
          path.join(
            expectedPathToNestedConfigGroup,
            CONFIG_GRP_DEST_RECORD_FILE_NAME
          ),
          diffDestinationRecordFile,
          TE.rightTask
        )
      ),

      TE.fold(
        () => () =>
          Promise.reject(
            manualFail(
              "Expected a 'CmdResponse' object, but got a CLI exit function"
            )
          ),

        ({
            errors,
            warnings,
            testOutput: configGroupDirPaths,
            nestedConfigGroupHasValidDefaultDestinationRecordFile,
          }) =>
          async () => {
            expect(errors).toBeEmpty();
            expect(warnings).toBeEmpty();
            expect(nestedConfigGroupHasValidDefaultDestinationRecordFile).toBeTrue();

            expect(configGroupDirPaths).toIncludeSameMembers([
              expectedPathToNestedConfigGroup,
            ]);
          }
      )
    )();

    // Cleanup
    await removeDirs([nameOfMockNestedConfigGroup]);
  });

  test('Should ensure that the create command can produce regular directories instead of config groups with the --regular flag', async () => {
    // Arrange
    const exampleDirsToCreate = [
      'top-level-dir-one',
      'top-level-dir-two',
      'top-level-dir-two/inner-dir',
      'top-level-dir-one/inner/inner/inner-dir',
    ];

    const commandOptions = ['-r', '--regular'][Math.floor(Math.random())];

    // Act
    const cmdOutputTE = createConfigGroupCmd(
      toPositionalArgs(exampleDirsToCreate),
      toCmdOptions([commandOptions])
    );

    const isCreatedDirAConfigGroup =
      (createdDirPath: string): T.Task<boolean> =>
      () =>
        pipe(
          path.join(createdDirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME),
          doesPathExist
        );

    // Assert
    await pipe(
      cmdOutputTE,

      TE.bindW(
        'areCreatedDirsAreConfigGroups',
        ({ testOutput: pathsToCreatedDirs }) =>
          pipe(
            pathsToCreatedDirs,
            T.traverseArray(isCreatedDirAConfigGroup),
            T.map(concatAll(MonoidAny)),
            TE.rightTask
          )
      ),

      TE.fold(
        () => () =>
          Promise.reject(
            manualFail(
              "Expected a 'CmdResponse' object, but got a CLI exit function"
            )
          ),

        ({
            errors,
            warnings,
            areCreatedDirsAreConfigGroups,
            testOutput: pathsToCreatedDirs,
          }) =>
          async () => {
            expect(errors).toBeEmpty();
            expect(warnings).toBeEmpty();
            expect(areCreatedDirsAreConfigGroups).toBeFalse();
            expect(pathsToCreatedDirs.length).toEqual(exampleDirsToCreate.length);
          }
      )
    )();

    // Cleanup
    await removeDirs(exampleDirsToCreate);
  });
});

describe('Tests for everything but the happy path', () => {
  test('Should ensure that the createConfigGroup command exits gracefully if no arguments are passed', async () => {
    // Arrange
    // Act
    const cmdOutputTE = createConfigGroupCmd([], []);

    // Assert
    await pipe(
      cmdOutputTE,

      TE.fold(
        exitFn => async () => {
          exitFn();
          expect(process.exit).toHaveBeenCalledWith(ExitCodes.GENERAL);
        },

        () => () =>
          Promise.reject(
            manualFail('Expected a CLI exit function, but got a CmdResponse object')
          )
      )
    )();
  });

  test(`Should ensure that the createConfigGroup command exits with errors if none of the required environment variables (${SHELL_VARS_TO_CONFIG_GRP_DIRS_STR}) are set`, async () => {
    // Arrange
    process.env.DOTS = '';
    process.env.DOTFILES = '';

    const nonExistingConfigGroupNames = [
      'rust',
      'shell',
      'starship',
      'zsh',
      'ohmyzsh',
    ];

    const mockConfigGroupNames = nonExistingConfigGroupNames.concat(
      NAMES_OF_EXISTING_CONFIG_GRPS
    );

    // Act
    const cmdOutputTE = createConfigGroupCmd(
      toPositionalArgs(mockConfigGroupNames),
      []
    );

    // Assert
    await pipe(
      cmdOutputTE,

      TE.fold(
        () => () =>
          Promise.reject(
            manualFail(
              "Expected a 'CmdResponse' object, but got a CLI exit function"
            )
          ),

        ({ errors, warnings, output: cmdResponse }) =>
          async () => {
            expect(errors).toBeArrayOfSize(mockConfigGroupNames.length);
            expect(warnings).toBeEmpty();
            expect(cmdResponse).toBeEmpty();
          }
      )
    )();

    // Cleanup
    process.env.DOTS = MOCK_DOTS_DIR;
    process.env.DOTFILES = MOCK_DOTS_DIR;
  });
});
