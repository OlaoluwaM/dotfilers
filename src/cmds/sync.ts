import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as L from 'monocle-ts/lib/Lens';
import * as RC from 'fp-ts/lib/Record';
import * as RT from 'fp-ts/lib/ReaderTask';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import { flow, pipe } from 'fp-ts/lib/function';
import { NonEmptyArray } from 'fp-ts/lib/NonEmptyArray';
import { newAggregateError } from '@utils/AggregateError';
import { ExitCodes, spinner } from '../constants.js';
import { optionConfigConstructor } from '@lib/arg-parser';
import { doesPathExistSync, execShellCmd } from '../utils/index';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import {
  CmdOptions,
  PositionalArgs,
  CmdFnWithTestOutput,
  CmdResponseWithTestOutput,
} from '@types';
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
export function _main(gitInstance: E.Either<Error, GitInstance>) {
  return (
    _: PositionalArgs,
    cmdOptions: CmdOptions
  ): ReturnType<CmdFnWithTestOutput<string>> =>
    pipe(
      gitInstance,
      TE.fromEither,
      TE.mapLeft(errorObj => exitCli(errorObj.message, ExitCodes.GENERAL)),

      TE.chainFirstIOK(initiateSpinner),

      TE.chainW(({ git, dotfilesDirPath }) =>
        pipe(syncCmd(git)(dotfilesDirPath)(cmdOptions), TE.rightTask)
      ),

      TE.chainFirstIOK(() => stopSpinnerOnSuccess),
      TE.mapLeft(flow(IO.chainFirst(() => stopSpinnerOnError)))
    );
}

function initiateSpinner() {
  return () => spinner.start('Syncing dotfiles changes...');
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

function syncCmd(git: SimpleGit) {
  return (dotfilesDirPath: string) => (cmdOptions: CmdOptions) =>
    flow(
      isGitInstalled,
      TE.chain(() => isGitRepo(dotfilesDirPath)),
      TE.chainW(() => pipe(dotfilesDirPath, repoHasACleanWorkingTree, TE.fromTask)),
      TE.fold(
        syncErrorStateMsg => async () =>
          constructSyncCmdErrorResponse(syncErrorStateMsg),

        handleSyncSuccessOutput(git)(dotfilesDirPath)(cmdOptions)
      )
    )();
}

function handleSyncSuccessOutput(git: SimpleGit) {
  return (dotfilesDirPath: string) =>
    (cmdOptions: CmdOptions) =>
    (dotfilesRepoStatus: SYNC_CMD_STATES) =>
    async () => {
      switch (dotfilesRepoStatus) {
        case SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES:
          return constructSyncCmdCmdOutput(
            SYNC_CMD_STATES.DOTFILES_DIR_HAS_NO_CHANGES
          );

        case SYNC_CMD_STATES.DOTFILES_DIR_HAS_CHANGES: {
          const commitMsg = generateGitCommitMessage(cmdOptions);
          // Since the enclosing function will be invoked within a `fold` we can perform a side effect
          return await pipe(
            performGitSyncOps(git)(dotfilesDirPath), // Side effect
            RT.map(constructSyncCmdCmdOutput)
          )(commitMsg)();
        }

        default:
          return constructSyncCmdErrorResponse(SYNC_CMD_STATES.FATAL_ERROR);
      }
    };
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
): CmdResponseWithTestOutput<string> {
  return {
    warnings: [],
    errors: [newAggregateError(syncCmdStateVal)],
    output: [],
    testOutput: '',
  };
}

function constructSyncCmdCmdOutput(
  syncCmdStateVal: string
): CmdResponseWithTestOutput<string> {
  return {
    warnings: [],
    errors: [],
    output: [syncCmdStateVal],
    testOutput: '',
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

function generateGitCommitMessage(cmdOptions: CmdOptions) {
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

function stopSpinnerOnSuccess() {
  return spinner.succeed('Sync complete!');
}

function stopSpinnerOnError() {
  return spinner.succeed('Sync failed. Exiting...');
}

const main = () => _main(generateGitInstance());
export default main;
