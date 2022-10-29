import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import boxen from 'boxen';

import { pipe } from 'fp-ts/lib/function';
import { exec } from 'child_process';
import { getEnv } from '@lib/shellVarStrExpander';
import { match, P } from 'ts-pattern';
import { promisify } from 'util';
import { isEmpty, slice } from 'ramda';
import { chalk, fs as fsExtra } from 'zx';
import { AnyFunction, DestinationPath, SourcePath } from '@types';
import { copyFile, link, symlink, unlink } from 'fs/promises';
import { SHELL_EXEC_MOCK_ERROR_HOOK, SHELL_EXEC_MOCK_VAR_NAME } from '../constants';
import {
  AggregateError,
  newAggregateError,
  getErrorMessagesFromAggregateErr,
} from './AggregateError';

export function getCLIArguments(startingInd: number) {
  return slice(startingInd, Infinity)(process.argv);
}

// NOTE: For debugging purposes only
export function trace<T>(...logContents: string[]) {
  return (val: T) => {
    const otherLogContents = isEmpty(logContents) ? ['Output: '] : logContents;
    console.log(...otherLogContents, val);
    return val;
  };
}

export function doesPathExist(
  pathToEntity: string
): TE.TaskEither<AggregateError, string> {
  return TE.tryCatch(
    async () => {
      const pathExists = await fsExtra.pathExists(pathToEntity);
      if (pathExists) return pathToEntity;

      throw new Error(`Could not find path to ${pathToEntity}`);
    },
    reason => newAggregateError(reason as Error)
  );
}

export function doesPathExistSync(pathToEntity: string): E.Either<Error, string> {
  return E.tryCatch(
    () => {
      const pathExists = fsExtra.pathExistsSync(pathToEntity);
      if (pathExists) return pathToEntity;

      throw new Error(`Could not find path to ${pathToEntity}`);
    },
    reason => reason as Error
  );
}

export function readJson<T>(jsonFilePath: string): TE.TaskEither<AggregateError, T> {
  return TE.tryCatch(
    (() => fsExtra.readJson(jsonFilePath)) as () => Promise<T>,
    reason => newAggregateError(reason as Error)
  );
}

export function getOnlyValueFromEntriesArr<K, V>(entries: [K, V]): V {
  return entries[1];
}

export function removeEntityAt(
  filePath: string
): TE.TaskEither<AggregateError, string> {
  return TE.tryCatch(
    async () => {
      await unlink(filePath);
      return filePath;
    },
    reason =>
      newAggregateError(
        `Error deleting entity at path ${filePath}: ${(reason as Error).message}`
      )
  );
}

export function logErrors(errors: AggregateError[]): IO.IO<void> {
  const errorMsgs = pipe(errors, A.map(getErrorMessagesFromAggregateErr), A.flatten);

  return () => {
    if (A.isEmpty(errorMsgs)) return;

    const errStr = pipe(
      errorMsgs,
      A.map(msg => chalk.red(msg)),
      A.intercalate(S.Monoid)('\n\n')
    );

    const title = `${chalk.redBright.bold('Errors')}(${chalk.red.dim(
      errorMsgs.length
    )})`;

    console.error(
      boxen(errStr, {
        title,
        padding: 1,
        borderColor: 'red',
      })
    );
  };
}

export function logOutput(outputMsgs: string[]): IO.IO<void> {
  return () => {
    if (A.isEmpty(outputMsgs)) return;

    const outputStr = pipe(
      outputMsgs,
      A.map(msg => chalk.green(msg)),
      A.intercalate(S.Monoid)('\n\n')
    );

    console.log(
      boxen(outputStr, {
        title: chalk.greenBright.bold('Success'),
        padding: 1,
        borderColor: 'green',
      })
    );
  };
}

type FsTask = (
  sourcePath: SourcePath,
  destinationPath: DestinationPath
) => Promise<void>;

function withDeleteFirst(fn: FsTask): FsTask {
  return async (sourcePath, destinationPath) => {
    try {
      await unlink(destinationPath);
    } catch {
      // We want to ignore the error
    } finally {
      await fn(sourcePath, destinationPath);
    }
  };
}

export const deleteThenSymlink = withDeleteFirst(symlink);
export const deleteThenHardlink = withDeleteFirst(link);
export const normalizedCopy = async (src: SourcePath, dest: DestinationPath) =>
  await copyFile(src, dest);

export function createDirIfItDoesNotExist(dirPath: string): T.Task<void> {
  return async () => await fsExtra.ensureDir(dirPath);
}

export function execShellCmd(shellCmd: string, scope: string = '') {
  const promisifiedExec = promisify(exec)(shellCmd, { shell: '/bin/bash' });

  return pipe(
    getEnv(`${SHELL_EXEC_MOCK_VAR_NAME}${scope}`),

    O.fold(
      () => promisifiedExec,

      varValue =>
        match(varValue)
          .with(SHELL_EXEC_MOCK_ERROR_HOOK, () =>
            Promise.reject(new Error(varValue))
          )
          .with(P.string, () => Promise.resolve({ stdout: varValue, stderr: '' }))
          .otherwise(() => promisifiedExec)
    )
  );
}

export function bind<Fn extends AnyFunction>(fn: Fn) {
  return (...argsToBind: Parameters<Fn>) =>
    () =>
      fn(...argsToBind) as ReturnType<Fn>;
}
