/* globals expect, describe, test */
import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as L from 'monocle-ts/Lens';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';

import path from 'path';
import fsPromise from 'fs/promises';

import { jest } from '@jest/globals';
import { SimpleGit } from 'simple-git';
import { execShellCmd } from '@utils/index';
import { Brand, createBrander } from '@lib/brand';
import { flow, identity, pipe } from 'fp-ts/lib/function';
import { TEST_DATA_DIR_PREFIX } from './setup';
import { toCmdOptions, CurriedReturnType } from '@types';
import { createFile, ExcludeFn, ExtractFn, normalizeStdout } from './helpers';
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

interface SyncCmd {
  syncCmd: ReturnType<typeof _main>;
  mockedSimpleGitInstance: SimpleGit | Error;
}

type CmdOutput = Awaited<CurriedReturnType<typeof _main>>;

type CmdDataOutput = ExcludeFn<CmdOutput>;
type ProcessExitFn = ExtractFn<CmdOutput>;

type RepoPath = Brand<string, 'Repo Path'>;
type UpstreamPath = Brand<string, 'Upstream Path'>;

const toRepoPath = createBrander<RepoPath>();
const toUpstreamPath = createBrander<UpstreamPath>();

const SYNC_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/sync`;

const VALID_CLEAN_GIT_REPO_DIR_PATH =
  `${SYNC_TEST_DATA_DIR}/valid-git-repo-clean` as RepoPath;

const VALID_WORKING_GIT_REPO_DIR_PATH =
  `${SYNC_TEST_DATA_DIR}/valid-git-repo-working` as RepoPath;

const VALID_CLEAN_GIT_REPO_UPSTREAM_DIR_PATH =
  `${SYNC_TEST_DATA_DIR}/valid-git-repo-clean-upstream` as UpstreamPath;

const VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH =
  `${SYNC_TEST_DATA_DIR}/valid-git-repo-working-upstream` as UpstreamPath;

function getSyncCmd(
  dotfilesDirPath: RepoPath = VALID_WORKING_GIT_REPO_DIR_PATH
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
  jest.spyOn(simpleGitInstance, 'add');
  jest.spyOn(simpleGitInstance, 'push');
  jest.spyOn(simpleGitInstance, 'commit');

  return simpleGitInstance;
}

function getAllFilesFromUpstream(upstreamPath: UpstreamPath) {
  return pipe(
    () =>
      execShellCmd(`git -C ${upstreamPath} ls-tree --full-tree -r --name-only HEAD`),
    T.map(({ stdout }) => normalizeStdout(stdout))
  );
}

function doesFileExistInUpstream(upstreamFilePath: UpstreamPath) {
  const upstreamPath = path.dirname(upstreamFilePath);
  const filename = path.basename(upstreamFilePath);

  return pipe(
    upstreamPath,
    toUpstreamPath,
    getAllFilesFromUpstream,
    T.map(RA.elem(S.Eq)(filename))
  );
}

function getUpstreamFileContents(upstreamFilePath: UpstreamPath) {
  const upstreamPath = path.dirname(upstreamFilePath);
  const filename = path.basename(upstreamFilePath);

  return pipe(
    () => execShellCmd(`git -C ${upstreamPath} show main:${filename} | cat`),
    T.map(({ stdout }) => stdout)
  );
}

function getAllFilesFromRepo(repoPath: RepoPath) {
  return pipe(
    () => fsPromise.readdir(repoPath, { withFileTypes: true }),
    T.map(
      flow(
        A.filter(dirent => dirent.isFile()),
        A.map(({ name }) => name)
      )
    )
  );
}

describe('Tests for the happy path', () => {
  test('Should ensure that the sync command works as expected given the desired, happy path, inputs', async () => {
    // Arrange
    const filename = 'new.txt';
    const expectedFileContents = 'This is a new file for testing purposes';

    await createFile(VALID_WORKING_GIT_REPO_DIR_PATH)(
      filename,
      expectedFileContents
    )();

    const defaultCommitMsg = generateDefaultCommitMessage();
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    const upstreamFilePath = pipe(
      path.join(VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH, filename),
      toUpstreamPath
    );

    const getUpstreamFileContentsOfCreatedFile =
      getUpstreamFileContents(upstreamFilePath);

    const doesCreatedFileExistInUpstream = doesFileExistInUpstream(upstreamFilePath);

    const retrieveAllRepoFiles = getAllFilesFromRepo(
      VALID_WORKING_GIT_REPO_DIR_PATH
    );

    const retrieveAllRepoUpstreamFiles = getAllFilesFromUpstream(
      VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH
    );

    // Act
    const cmdOutput = await syncCmd([], [])();

    // Assert
    expect(cmdOutput).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).toHaveBeenCalledWith(
      defaultCommitMsg
    );

    expect((mockedSimpleGitInstance as SimpleGit).add).toHaveBeenCalledWith([
      VALID_WORKING_GIT_REPO_DIR_PATH,
      '--all',
    ]);

    expect(cmdOutput as CmdDataOutput).toMatchObject<CmdDataOutput>({
      errors: [],
      warnings: [],
      testOutput: '',
      output: [defaultCommitMsg],
    });

    expect(await doesCreatedFileExistInUpstream()).toBeTrue();

    expect(await getUpstreamFileContentsOfCreatedFile()).toEqual(
      expectedFileContents
    );

    expect(await retrieveAllRepoFiles()).toIncludeSameMembers(
      await retrieveAllRepoUpstreamFiles()
    );
  });

  test('Should ensure that the sync command accepts a custom commit messages', async () => {
    // Arrange
    const filename = 'update.txt';
    const expectedFileContents =
      'This is yet another file for testing purposes. Its an update!';

    await createFile(VALID_WORKING_GIT_REPO_DIR_PATH)(
      filename,
      expectedFileContents
    )();

    const customCommitMsg = 'feat: scheduled dotfiles update successful';
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    const upstreamFilePath = pipe(
      path.join(VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH, filename),
      toUpstreamPath
    );

    const getUpstreamFileContentsOfCreatedFile =
      getUpstreamFileContents(upstreamFilePath);

    const doesCreatedFileExistInUpstream = doesFileExistInUpstream(upstreamFilePath);

    const retrieveAllRepoFiles = getAllFilesFromRepo(
      VALID_WORKING_GIT_REPO_DIR_PATH
    );
    const retrieveAllRepoUpstreamFiles = getAllFilesFromUpstream(
      VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH
    );

    // Act
    const cmdOutput = await syncCmd([], toCmdOptions(['-m', customCommitMsg]))();

    // Assert
    expect(cmdOutput).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).toHaveBeenCalledWith(
      customCommitMsg
    );

    expect((mockedSimpleGitInstance as SimpleGit).add).toHaveBeenCalledWith([
      VALID_WORKING_GIT_REPO_DIR_PATH,
      '--all',
    ]);

    expect(cmdOutput as CmdDataOutput).toMatchObject<CmdDataOutput>({
      errors: [],
      warnings: [],
      testOutput: '',
      output: [customCommitMsg],
    });

    expect(await doesCreatedFileExistInUpstream()).toBeTrue();

    expect(await getUpstreamFileContentsOfCreatedFile()).toEqual(
      expectedFileContents
    );

    expect(await retrieveAllRepoFiles()).toIncludeSameMembers(
      await retrieveAllRepoUpstreamFiles()
    );
  });

  test('Should ensure that sync command falls back to using default commit message if custom message is empty string', async () => {
    // Arrange
    const filename = 'another-one.txt';
    const expectedFileContents =
      'This is yet another file for testing purposes. Another one!';

    await createFile(VALID_WORKING_GIT_REPO_DIR_PATH)(
      filename,
      expectedFileContents
    )();

    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();
    const expectedCommitMessage = generateDefaultCommitMessage();

    const upstreamFilePath = pipe(
      path.join(VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH, filename),
      toUpstreamPath
    );

    const getUpstreamFileContentsOfCreatedFile =
      getUpstreamFileContents(upstreamFilePath);

    const doesCreatedFileExistInUpstream = doesFileExistInUpstream(upstreamFilePath);

    const retrieveAllRepoFiles = getAllFilesFromRepo(
      VALID_WORKING_GIT_REPO_DIR_PATH
    );
    const retrieveAllRepoUpstreamFiles = getAllFilesFromUpstream(
      VALID_WORKING_GIT_REPO_UPSTREAM_DIR_PATH
    );

    // Act
    const cmdOutput = await syncCmd([], toCmdOptions(['-m', '']))();

    // Assert
    expect(cmdOutput).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).toHaveBeenCalledWith(
      expectedCommitMessage
    );
    expect((mockedSimpleGitInstance as SimpleGit).add).toHaveBeenCalledWith([
      VALID_WORKING_GIT_REPO_DIR_PATH,
      '--all',
    ]);

    expect(cmdOutput as CmdDataOutput).toMatchObject<CmdDataOutput>({
      errors: [],
      warnings: [],
      testOutput: '',
      output: [expectedCommitMessage],
    });

    expect(await doesCreatedFileExistInUpstream()).toBeTrue();

    expect(await getUpstreamFileContentsOfCreatedFile()).toEqual(
      expectedFileContents
    );

    expect(await retrieveAllRepoFiles()).toIncludeSameMembers(
      await retrieveAllRepoUpstreamFiles()
    );
  });

  test('Should ensure that the sync command exits early (and successfully) should there be no changes in the dotfiles repo', async () => {
    // Arrange
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd(
      VALID_CLEAN_GIT_REPO_DIR_PATH
    );

    const retrieveAllRepoFiles = getAllFilesFromRepo(VALID_CLEAN_GIT_REPO_DIR_PATH);
    const retrieveAllRepoUpstreamFiles = getAllFilesFromUpstream(
      VALID_CLEAN_GIT_REPO_UPSTREAM_DIR_PATH
    );

    // Act
    const cmdOutput = await syncCmd([], toCmdOptions(['-m', '']))();

    // Assert
    expect(cmdOutput).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).add).not.toHaveBeenCalled();

    expect(cmdOutput as CmdDataOutput).toMatchObject<CmdDataOutput>({
      errors: [],
      warnings: [],
      testOutput: '',
      output: [SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES],
    });

    expect(await retrieveAllRepoFiles()).toIncludeSameMembers(
      await retrieveAllRepoUpstreamFiles()
    );
  });
});

describe('Tests for everything but the happy path', () => {
  test('Should ensure the sync command exits if the dotfiles directory is invalid', async () => {
    // Arrange
    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd(
      pipe(`${SYNC_TEST_DATA_DIR}/random-dir`, toRepoPath)
    );

    // Act
    const cmdOutput = (await syncCmd([], [])()) as ProcessExitFn;

    cmdOutput();

    // Assert
    expect(cmdOutput).toBeInstanceOf(Function);
    expect(process.exit).toHaveBeenCalledWith(ExitCodes.GENERAL);
    expect(mockedSimpleGitInstance).toBeInstanceOf(Error);
  });

  test('Should ensure that the sync command exits if dotfiles directory is not a git repository', async () => {
    // Arrange
    process.env[`${SHELL_EXEC_MOCK_VAR_NAME}forGitRepoCheck`] =
      SHELL_EXEC_MOCK_ERROR_HOOK;

    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    // Act
    const cmdOutput = await syncCmd([], [])();

    // Assert
    expect(cmdOutput).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).add).not.toHaveBeenCalled();

    expect(cmdOutput as CmdDataOutput).toMatchObject<CmdDataOutput>({
      errors: [SYNC_CMD_STATES.DOTFILES_DIR_IS_NOT_GIT_REPO],
      warnings: [],
      testOutput: '',
      output: [],
    });
  });

  test('Should ensure that the sync command exits gracefully if git is not installed?', async () => {
    // Arrange
    process.env[`${SHELL_EXEC_MOCK_VAR_NAME}forGitCheck`] =
      SHELL_EXEC_MOCK_ERROR_HOOK;

    const { syncCmd, mockedSimpleGitInstance } = getSyncCmd();

    // Act
    const cmdOutput = await syncCmd([], [])();

    // Assert
    expect(cmdOutput).not.toBeInstanceOf(Function);
    expect(mockedSimpleGitInstance).not.toBeInstanceOf(Error);

    expect((mockedSimpleGitInstance as SimpleGit).push).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).commit).not.toHaveBeenCalled();
    expect((mockedSimpleGitInstance as SimpleGit).add).not.toHaveBeenCalled();

    expect(cmdOutput as CmdDataOutput).toMatchObject<CmdDataOutput>({
      errors: [SYNC_CMD_STATES.GIT_IS_NOT_INSTALLED],
      warnings: [],
      testOutput: '',
      output: [],
    });
  });
});
