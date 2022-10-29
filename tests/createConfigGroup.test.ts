/* globals expect, describe, test, beforeAll */

import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';

import path from 'path';

import { rm } from 'fs/promises';
import { pipe } from 'fp-ts/lib/function';
import { fs as fsExtra } from 'zx';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { toPositionalArgs, CurriedReturnType } from '@types';
import { default as createConfigGroupCmd } from '@cmds/createConfigGroup';
import { DEFAULT_DEST_RECORD_FILE_CONTENTS } from '@app/configGroup';
import { defaultDestRecordEq, ExcludeFn, ExtractFn, generatePath } from './helpers';
import {
  ExitCodes,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../src/constants';

type CmdOutput = Awaited<CurriedReturnType<typeof createConfigGroupCmd>>;

type CmdDataOutput = ExcludeFn<CmdOutput>;
type ProcessExitFn = ExtractFn<CmdOutput>;

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
      const cmdOutput = await createConfigGroupCmd(
        toPositionalArgs(
          nonExistingConfigGroupNames.concat(NAMES_OF_EXISTING_CONFIG_GRPS)
        ),
        []
      )();

      const {
        errors,
        warnings,
        testOutput: configGroupDirPaths,
      } = cmdOutput as CmdDataOutput;

      const numOfCreatedConfigGroups = await pipe(
        configGroupDirPaths,
        T.traverseArray(configGroupDirPath =>
          pipe(
            path.join(configGroupDirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME),
            diffDestinationRecordFile
          )
        ),
        T.map(RA.filter(Boolean)),
        T.map(RA.size)
      )();

      // Assert
      expect(errors).toBeEmpty();
      expect(warnings).toBeArrayOfSize(NAMES_OF_EXISTING_CONFIG_GRPS.length);
      expect(numOfCreatedConfigGroups).toBe(nonExistingConfigGroupNames.length);

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
    const cmdOutput = await createConfigGroupCmd(
      toPositionalArgs([nameOfMockNestedConfigGroup]),
      []
    )();

    const {
      errors,
      warnings,
      testOutput: configGroupDirPaths,
    } = cmdOutput as CmdDataOutput;

    const nestedConfigGroupHasValidDefaultDestinationRecordFile = await pipe(
      path.join(expectedPathToNestedConfigGroup, CONFIG_GRP_DEST_RECORD_FILE_NAME),
      diffDestinationRecordFile
    )();

    // Assert
    expect(errors).toBeEmpty();
    expect(warnings).toBeEmpty();
    expect(nestedConfigGroupHasValidDefaultDestinationRecordFile).toBeTrue();

    expect(configGroupDirPaths).toIncludeSameMembers([
      expectedPathToNestedConfigGroup,
    ]);

    // Cleanup
    await removeDirs([nameOfMockNestedConfigGroup]);
  });
});

describe('Tests for everything but the happy path', () => {
  test('Should ensure that the createConfigGroup command exits gracefully if no arguments are passed', async () => {
    // Arrange
    // Act
    const cmdOutput = (await createConfigGroupCmd([], [])()) as ProcessExitFn;

    cmdOutput();

    // Assert
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.GENERAL);
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
    const cmdOutput = await createConfigGroupCmd(
      toPositionalArgs(mockConfigGroupNames),
      []
    )();

    const { errors, warnings, output: cmdResponse } = cmdOutput as CmdDataOutput;

    // Assert
    expect(errors).toBeArrayOfSize(mockConfigGroupNames.length);
    expect(warnings).toBeEmpty();
    expect(cmdResponse).toBeEmpty();

    // Cleanup
    process.env.DOTS = MOCK_DOTS_DIR;
    process.env.DOTFILES = MOCK_DOTS_DIR;
  });
});
