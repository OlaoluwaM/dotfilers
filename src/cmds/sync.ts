import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/lib/Option';
import * as L from 'monocle-ts/Lens';
import * as RC from 'fp-ts/lib/Record';
import * as RT from 'fp-ts/lib/ReaderTask';
import * as TE from 'fp-ts/lib/TaskEither';

import { ExitCodes } from '../constants';
import { CmdResponse } from '@types';
import { NonEmptyArray } from 'fp-ts/lib/NonEmptyArray';
import { flow, identity, pipe } from 'fp-ts/lib/function';
import { optionConfigConstructor } from '@lib/arg-parser';
import { doesPathExistSync, execShellCmd } from '../utils/index';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import {
  exitCli,
  getParsedOptions,
  getPathToDotfilesDirPath,
  getPathToDotfilesDirPathRetrievalError,
} from '@app/helpers';

interface ParsedCmdOptions {
  readonly message: string;
}

// EXPORTED FOR TESTING PURPOSES ONLY
export interface GitInstance {
  readonly dotfilesDirPath: string;
  readonly git: SimpleGit;
}

// EXPORTED FOR TESTING PURPOSES ONLY
// Ideally, we should have the gitInstance come as the last parameter, but it's more general than the cmdOptions parameter
export function _main(gitInstance: E.Either<Error, GitInstance>) {
  return (_: string[], cmdOptions: string[] = []) =>
    pipe(
      gitInstance,
      TE.fromEither,
      TE.foldW(
        errorObj => async () => exitCli(errorObj.message, ExitCodes.GENERAL),
        ({ git, dotfilesDirPath }) =>
          async () =>
            // The reason we are invoking this here is because we do not want to have to differentiate between an asynchronous function (Task)
            // and a synchronous function (IO) later in the pipeline
            await syncCmd(git, cmdOptions)(dotfilesDirPath)()
      )
    );
}

// EXPORTED FOR TESTING PURPOSES ONLY
export function generateGitInstance() {
  return pipe(
    getPathToDotfilesDirPath(),
    E.fromOption(generateMissingDotfilesDirPathError),
    E.chain(doesPathExistSync),
    E.mapLeft(getPathToDotfilesDirPathRetrievalError()),
    E.map(
      (dotfilesDirPath): GitInstance => ({
        dotfilesDirPath,
        git: pipe(dotfilesDirPath, generateSimpleGitOptions, simpleGit),
      })
    )
  );
}

function generateMissingDotfilesDirPathError() {
  return new Error(
    'No action was taken, but the path to your dotfiles directory could not be determined. Please specify at least one of the required environment variables then try again. If the issue persists then you can open an issue on Github'
  );
}

type SyncCmdSimpleGitOptions = Pick<
  Partial<SimpleGitOptions>,
  'baseDir' | 'binary' | 'trimmed' | 'maxConcurrentProcesses'
>;

function generateSimpleGitOptions(baseDir: string): SyncCmdSimpleGitOptions {
  return {
    baseDir,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
  };
}

// EXPORTED FOR TESTING PURPOSES ONLY
export enum SYNC_CMD_STATES {
  GIT_IS_INSTALLED = 'Git is installed',

  DOTFILES_DIR_IS_VALID_GIT_REPO = 'Dotfiles dir is a valid git repo',

  DOTFILES_DIR_HAS_NO_CHANGES = 'No action was taken because nothing changed in your dotfiles directory',

  DOTFILES_DIR_HAS_CHANGES = 'Dotfiles directory contains changes to be synced',

  DOTFILES_SYNCED = 'Syncing Complete! You can check out the commit in your remote repository',

  FATAL_ERROR = 'No action was taken as a an error has occurred. Please check your inputs and try again. If the error persists then create an issue on GitHub',

  GIT_IS_NOT_INSTALLED = 'Sync Error! No action was taken because git is not installed on your system. This command requires git to be installed. Please do so before running this command again. If git is already installed, please create an issue on Github',

  DOTFILES_DIR_IS_NOT_GIT_REPO = "Sync error! No action was taken because your dotfiles directory is not a git repository or it didn't have a remote set yet. You will need to make it a git repository. If it's already a git repo with a valid remote, please create an issue on Github",
}

function syncCmd(git: SimpleGit, cmdOptions: string[]) {
  return (dotfilesDirPath: string) =>
    flow(
      isGitInstalled,
      TE.chain(() => isGitRepo(dotfilesDirPath)),
      TE.chainW(() => pipe(dotfilesDirPath, repoHasACleanWorkingTree, TE.fromTask)),

      TE.fold(
        syncErrorStateMsg => async () =>
          constructSyncCmdErrorResponse(syncErrorStateMsg),

        dotfilesRepoStatus => async () => {
          switch (dotfilesRepoStatus) {
            case SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES:
              return constructSyncCmdSuccessResponse(
                SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES
              );

            case SYNC_CMD_STATES.DOTFILES_DIR_HAS_CHANGES: {
              const commitMsg = generateGitCommitMessage(cmdOptions);
              // Since this is within a `fold` we can perform a side effect
              return await pipe(
                performGitSyncOps(git)(dotfilesDirPath), // Side effect
                RT.map(constructSyncCmdSuccessResponse)
              )(commitMsg)();
            }

            default:
              return constructSyncCmdErrorResponse(SYNC_CMD_STATES.FATAL_ERROR);
          }
        }
      )
    )();
}

function isGitInstalled() {
  return TE.tryCatch(
    async () => {
      await execShellCmd(`command -v git &>/dev/null`, 'forGitCheck');
      return SYNC_CMD_STATES.GIT_IS_INSTALLED;
    },
    () => SYNC_CMD_STATES.GIT_IS_NOT_INSTALLED
  );
}

function isGitRepo(dirPath: string) {
  return TE.tryCatch(
    async () => {
      // This shell command checks whether a specific directory is a git repo. Gotten from here: https://stackoverflow.com/a/39518382/17612886
      await execShellCmd(
        `git -C ${dirPath} rev-parse 2>/dev/null`,
        'forGitRepoCheck'
      );
      return SYNC_CMD_STATES.DOTFILES_DIR_IS_VALID_GIT_REPO;
    },
    () => SYNC_CMD_STATES.DOTFILES_DIR_IS_NOT_GIT_REPO
  );
}

// A 'clean working directory' means that there are no changes to be staged, committed, or pushed
function repoHasACleanWorkingTree(dirPath: string) {
  return async () => {
    try {
      await execShellCmd(
        `[[ $(git -C ${dirPath} status --porcelain | wc -l) -gt "0" ]]`
      );
      return SYNC_CMD_STATES.DOTFILES_DIR_HAS_CHANGES;
    } catch {
      return SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES;
    }
  };
}

function constructSyncCmdErrorResponse(
  syncCmdStateVal: string
): CmdResponse<string> {
  return {
    warnings: [],
    errors: [syncCmdStateVal],
    output: [],
    forTest: '',
  };
}

function constructSyncCmdSuccessResponse(
  syncCmdStateVal: string
): CmdResponse<string> {
  return {
    warnings: [],
    errors: [],
    output: [syncCmdStateVal],
    forTest: '',
  };
}

function performGitSyncOps(git: SimpleGit) {
  return (dotfilesDirPath: string): RT.ReaderTask<string, string> =>
    (commitMsg: string) =>
    async () => {
      await git.add([dotfilesDirPath, '--all']).commit(commitMsg).push();
      return commitMsg;
    };
}

function generateGitCommitMessage(cmdOptions: string[]) {
  const CommitMessageLens = pipe(L.id<ParsedCmdOptions>(), L.prop('message'));

  return pipe(
    cmdOptions,
    pipe(generateOptionConfig(), getParsedOptions),
    RC.map(O.getOrElse(generateDefaultCommitMessage)),
    CommitMessageLens.get
  );
}

function generateOptionConfig() {
  return {
    options: {
      message: optionConfigConstructor({
        parser: rawMessageParser,
        aliases: ['m'],
      }),
    },
  };
}

function rawMessageParser([message]: NonEmptyArray<string>): string {
  if (message.length === 0) return generateDefaultCommitMessage();
  return message;
}

// EXPORTED FOR TESTING PURPOSES ONLY
export function generateDefaultCommitMessage() {
  return 'chore: dotfiles update!';
}

const main =
  process.env.NODE_ENV === 'test' ? identity : _main(generateGitInstance());

export default main;
