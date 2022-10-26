/* globals expect, describe, test */
import * as E from 'fp-ts/lib/Either';
import * as L from 'monocle-ts/Lens';

import { jest } from '@jest/globals';
import { SimpleGit } from 'simple-git';
import { createFile } from './helpers';
import { CmdResponse } from '@types';
import { identity, pipe } from 'fp-ts/lib/function';
import { TEST_DATA_DIR_PREFIX } from './setup';
import {
  ExitCodes,
  SHELL_EXEC_MOCK_VAR_NAME,
  SHELL_EXEC_MOCK_ERROR_HOOK,
} from '../src/constants';
import {
  _main,
  GitInstance,
  SYNC_CMD_STATES,
  generateGitInstance,
  generateDefaultCommitMessage,
} from '../src/cmds/sync';
import { execShellCmd } from '@utils/index';

const SYNC_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/sync`;

const VALID_CLEAN_GIT_REPO_DIR_PATH = `${SYNC_TEST_DATA_DIR}/valid-git-repo-clean`;
const VALID_WORKING_GIT_REPO_DIR_PATH = `${SYNC_TEST_DATA_DIR}/valid-git-repo-working`;

interface SyncCmd {
  syncCmd: ReturnType<typeof _main>;
  mockedSimpleGitInstance: SimpleGit | Error;
}

function getSyncCmd(
  dotfilesDirPath: string = VALID_WORKING_GIT_REPO_DIR_PATH
): SyncCmd {
  process.env.DOTS = dotfilesDirPath;
  process.env.DOTFILES = dotfilesDirPath;

  const GitLens = pipe(L.id<GitInstance>(), L.prop('git'));

  const mockedSimpleGitInstance = pipe(
    generateGitInstance(),
    E.map(pipe(GitLens, L.modify(mockSimpleGitInstance)))
  );

  return {
    mockedSimpleGitInstance: pipe(
      mockedSimpleGitInstance,
      E.map(GitLens.get),
      E.matchW(identity, identity)
    ),
    syncCmd: _main(mockedSimpleGitInstance),
  };
}

function mockSimpleGitInstance(simpleGitInstance: SimpleGit) {
  // any castings are used here so I don't need to reimplement the simplegit signature for these methods
  jest.spyOn(simpleGitInstance, 'add').mockReturnValue(simpleGitInstance as any);
  jest.spyOn(simpleGitInstance, 'commit').mockReturnValue(simpleGitInstance as any);
  jest.spyOn(simpleGitInstance, 'push').mockReturnValue(simpleGitInstance as any);

  return simpleGitInstance;
}

describe('Tests for the happy path', () => {
  test('Should ensure that the sync command works as expected given the desired, happy path, inputs', async () => {
    // Arrange
    await createFile(VALID_WORKING_GIT_REPO_DIR_PATH)('new.ts', '')();
    const { stdout } = await execShellCmd(
      `git -C ${VALID_WORKING_GIT_REPO_DIR_PATH} status --porcelain`
    );

    const defaultCommitMsg = generateDefaultCommitMessage();
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    // Act
    const outputVal = await syncCmd([], [])();
    console.log({ outputVal, VALID_WORKING_GIT_REPO_DIR_PATH, stdout });

    // Assert
    expect(outputVal).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).toHaveBeenCalledWith(
      defaultCommitMsg
    );
    expect((mockedSimpleGitInstance as SimpleGit).add).toHaveBeenCalledWith([
      VALID_WORKING_GIT_REPO_DIR_PATH,
      '--all',
    ]);

    expect(outputVal as CmdResponse<string>).toMatchObject<CmdResponse<string>>({
      errors: [],
      warnings: [],
      forTest: '',
      output: [defaultCommitMsg],
    });
  });

  test('Should ensure that the sync command accepts a custom commit messages', async () => {
    // Arrange
    await createFile(VALID_WORKING_GIT_REPO_DIR_PATH)('update.ts', '')();
    const { stdout } = await execShellCmd(
      `git -C ${VALID_WORKING_GIT_REPO_DIR_PATH} status --porcelain`
    );

    const customCommitMsg = 'feat: scheduled dotfiles update successful';
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    // Act
    const outputVal = await syncCmd([], ['-m', customCommitMsg])();
    console.log({ outputVal, VALID_WORKING_GIT_REPO_DIR_PATH, stdout });

    // Assert
    expect(outputVal).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).toHaveBeenCalledWith(
      customCommitMsg
    );
    expect((mockedSimpleGitInstance as SimpleGit).add).toHaveBeenCalledWith([
      VALID_WORKING_GIT_REPO_DIR_PATH,
      '--all',
    ]);

    expect(outputVal as CmdResponse<string>).toMatchObject<CmdResponse<string>>({
      errors: [],
      warnings: [],
      forTest: '',
      output: [customCommitMsg],
    });
  });

  test('Should ensure that sync command falls back to using default commit message if custom message is empty string', async () => {
    // Arrange
    await createFile(VALID_WORKING_GIT_REPO_DIR_PATH)('another-one.ts', '')();
    const { stdout } = await execShellCmd(
      `git -C ${VALID_WORKING_GIT_REPO_DIR_PATH} status --porcelain`
    );

    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();
    const expectedCommitMessage = generateDefaultCommitMessage();

    // Act
    const outputVal = await syncCmd([], ['-m', ''])();
    console.log({ outputVal, VALID_WORKING_GIT_REPO_DIR_PATH, stdout });

    // Assert
    expect(outputVal).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).toHaveBeenCalledWith(
      expectedCommitMessage
    );
    expect((mockedSimpleGitInstance as SimpleGit).add).toHaveBeenCalledWith([
      VALID_WORKING_GIT_REPO_DIR_PATH,
      '--all',
    ]);

    expect(outputVal as CmdResponse<string>).toMatchObject<CmdResponse<string>>({
      errors: [],
      warnings: [],
      forTest: '',
      output: [expectedCommitMessage],
    });
  });

  test('Should ensure that the sync command exits early (and successfully) should there be no changes in the dotfiles repo', async () => {
    // Arrange
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd(
      VALID_CLEAN_GIT_REPO_DIR_PATH
    );

    // Act
    const outputVal = await syncCmd([], ['-m', ''])();

    // Assert
    expect(outputVal).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).add).not.toHaveBeenCalled();

    expect(outputVal as CmdResponse<string>).toMatchObject<CmdResponse<string>>({
      errors: [],
      warnings: [],
      forTest: '',
      output: [SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES],
    });
  });
});

describe('Tests for everything but the happy path', () => {
  test('Should ensure the sync command exits if the dotfiles directory is invalid', async () => {
    // Arrange
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd(
      `${SYNC_TEST_DATA_DIR}/random-dir`
    );

    // Act
    const outputVal = await syncCmd([], [])();
    (outputVal as Function)(); // We expect output to be of type IO<never>

    // Assert
    expect(outputVal).toBeInstanceOf(Function);
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.GENERAL);
    expect(mockedSimpleGitInstance).toBeInstanceOf(Error);
  });

  test('Should ensure that the sync command exits if dotfiles directory is not a git repository', async () => {
    // Arrange
    process.env[`${SHELL_EXEC_MOCK_VAR_NAME}forGitRepoCheck`] =
      SHELL_EXEC_MOCK_ERROR_HOOK;

    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    // Act
    const outputVal = await syncCmd([], [])();

    // Assert
    expect(outputVal).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).add).not.toHaveBeenCalled();

    expect(outputVal as CmdResponse<string>).toMatchObject<CmdResponse<string>>({
      errors: [SYNC_CMD_STATES.DOTFILES_DIR_IS_NOT_GIT_REPO],
      warnings: [],
      forTest: '',
      output: [],
    });
  });

  test('Should ensure that the sync command exits gracefully if git is not installed?', async () => {
    // Arrange
    process.env[`${SHELL_EXEC_MOCK_VAR_NAME}forGitCheck`] =
      SHELL_EXEC_MOCK_ERROR_HOOK;

    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    // Act
    const outputVal = await syncCmd([], [])();

    // Assert
    expect(outputVal).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).add).not.toHaveBeenCalled();

    expect(outputVal as CmdResponse<string>).toMatchObject<CmdResponse<string>>({
      errors: [SYNC_CMD_STATES.GIT_IS_NOT_INSTALLED],
      warnings: [],
      forTest: '',
      output: [],
    });
  });
});
