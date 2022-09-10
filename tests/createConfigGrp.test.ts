import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';

import path from 'path';

import { rm } from 'fs/promises';
import { pipe } from 'fp-ts/lib/function';
import { fs as fsExtra } from 'zx';
import { defaultDestRecordEq } from './helpers';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { default as createConfigGrpCmd } from '@cmds/createConfigGrp';
import { DEFAULT_DEST_RECORD_FILE_CONTENTS } from '@app/configGrpOps';
import { describe, test, expect, beforeAll } from '@jest/globals';
import {
  ExitCodes,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../src/constants';

const CMD_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/create-config-grp`;

beforeAll(() => {
  process.env.DOTS = `${CMD_TEST_DATA_DIR}/mock-dots`;
  process.env.DOTFILES = `${CMD_TEST_DATA_DIR}/mock-dots`;
});

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
    A.map(dirName => path.join(CMD_TEST_DATA_DIR, 'mock-dots', dirName)),
    T.traverseArray(dirPath => () => rm(dirPath, { force: true, recursive: true }))
  )();
}

const NAMES_OF_EXISTING_CONFIG_GRPS = ['bat', 'git', 'cava', 'npm'];

describe('Tests for the happy path', () => {
  test.each([
    ['DOTS', ['spicetify', 'btop', 'mcfly']],
    ['DOTFILES', ['node', 'tilix', 'neovim', 'fzf']],
  ])(
    'Should ensure that the createConfigGrp command can create config groups with default destination record files even if one (%s) of the two mutually exclusive environment variables is not set',
    async (envVarName, nonExistingConfigGrpNames) => {
      // Arrange
      process.env[envVarName] = '';

      // Act
      const {
        errors,
        warnings,
        output: cmdOutput,
        forTest: configGrpDirPaths,
      } = await createConfigGrpCmd(
        nonExistingConfigGrpNames.concat(NAMES_OF_EXISTING_CONFIG_GRPS)
      );

      const numOfCreatedConfigGrps = await pipe(
        configGrpDirPaths,
        T.traverseArray(configGrpDirPath =>
          pipe(
            `${configGrpDirPath}/${CONFIG_GRP_DEST_RECORD_FILE_NAME}`,
            diffDestinationRecordFile
          )
        ),
        T.map(RA.filter(Boolean)),
        T.map(RA.size)
      )();

      // Assert
      expect(errors).toEqual([]);
      expect(warnings?.length).toBe(NAMES_OF_EXISTING_CONFIG_GRPS.length);
      expect(numOfCreatedConfigGrps).toBe(nonExistingConfigGrpNames.length);
      expect(cmdOutput.length).toBeGreaterThanOrEqual(
        nonExistingConfigGrpNames.length
      );

      // Cleanup
      process.env[envVarName] = `${CMD_TEST_DATA_DIR}/mock-dots`;
      await removeDirs(nonExistingConfigGrpNames);
    }
  );

  test.todo('Can I create a nested config group?');
});

describe('Tests for everything but the happy path', () => {
  test('Should ensure that the createConfigGrp command exits gracefully if no arguments are passed', async () => {
    // Arrange
    // Act
    await createConfigGrpCmd([]);

    // Assert
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.GENERAL);
  });

  test(`Should ensure that the createConfigGrp command exits with errors if none of the required environment variables (${SHELL_VARS_TO_CONFIG_GRP_DIRS_STR}) are set`, async () => {
    // Arrange
    process.env.DOTS = '';
    process.env.DOTFILES = '';

    const nonExistingConfigGrpNames = [
      'rust',
      'shell',
      'starship',
      'zsh',
      'ohmyzsh',
    ];

    const mockConfigGrpNames = nonExistingConfigGrpNames.concat(
      NAMES_OF_EXISTING_CONFIG_GRPS
    );

    // Act
    const {
      errors,
      warnings,
      output: cmdOutput,
    } = await createConfigGrpCmd(mockConfigGrpNames);

    // Assert
    expect([warnings, cmdOutput]).toEqual([[], []]);
    expect(errors.length).toBe(mockConfigGrpNames.length);
  });
});
