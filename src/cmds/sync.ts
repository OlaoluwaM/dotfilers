import * as E from 'fp-ts/Either';

import { pipe } from 'fp-ts/lib/function';
import { match } from 'ts-pattern';
import { ExitCodes } from 'src/constants';
import { CmdResponse } from '@types';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import {
  exitCli,
  getPathToDotfilesDirPath,
  getPathToDotfilesDirPathRetrievalError,
} from '@app/helpers';
import parseCliArgs from '@lib/minimal-argp';

const syncCmdCliOptionsConfig = {
  options: {
    custom: {
      type: Boolean,
      alias: 'C',
    },
  },
} as const;

const main = _main();

// ! Exported for testing purposes
export function _main(simpleGitInstanceToUse?: SimpleGit) {
  return async (_: string[], cliOptions: string[] = []) => {
    const simpleGitInstance = pipe(
      simpleGitInstanceToUse,
      E.fromNullable(new Error('No simple git instance was passed!')),
      E.alt(generateSimpleGitInstance)
    );

    const cmdOutput = await match(simpleGitInstance)
      .with({ _tag: 'Left' }, (___, { left: err }) =>
        exitCli(err.message, ExitCodes.GENERAL)
      )
      .with({ _tag: 'Right' }, (___, { right }) => syncCmd(right, cliOptions))
      .exhaustive();

    return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
  };
}

type SyncCmdSimpleGitOptions = Pick<
  Partial<SimpleGitOptions>,
  'baseDir' | 'binary' | 'trimmed' | 'maxConcurrentProcesses'
>;

function generateSimpleGitInstance() {
  return pipe(
    getPathToDotfilesDirPath(),
    E.fromOption(getPathToDotfilesDirPathRetrievalError()),
    E.map(generateSimpleGitOptions),
    E.map(simpleGit)
  );
}

function generateSimpleGitOptions(baseDir: string): SyncCmdSimpleGitOptions {
  return {
    baseDir,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: false,
  };
}

async function syncCmd(simpleGitInstance: SimpleGit, cliOptions: string[]) {
  const commitMessage = generateGitCommitMessage(cliOptions);
}

function generateGitCommitMessage(cliOptions: string[]) {
  const { options: parsedSyncCmdOptions } = pipe(
    cliOptions,
    parseCliArgs(syncCmdCliOptionsConfig)
  );
}

export default main;
