import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';
import * as NEA from 'fp-ts/lib/NonEmptyArray';

import chalk from 'chalk';
import fsExtra from 'fs-extra';

import { pipe } from 'fp-ts/lib/function';
import { exec } from 'child_process';
import { getEnv } from '@lib/shellVarStrExpander';
import { match, P } from 'ts-pattern';
import { promisify } from 'util';
import { isEmpty, slice, transpose } from 'ramda';
import { copyFile, link, symlink, unlink } from 'fs/promises';
import { SHELL_EXEC_MOCK_VAR_NAME, SHELL_EXEC_MOCK_ERROR_HOOK } from '../constants';
import {
  AggregateError,
  newAggregateError,
  getErrorMessagesFromAggregateErr,
} from './AggregateError';
import {
  CliInputs,
  SourcePath,
  AnyFunction,
  toCliInputs,
  CmdResponse,
  DestinationPath,
  ParsedCmdResponse,
} from '@types';

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

function toErrorMsgs(aggregateErrors: AggregateError[]): string[] {
  return pipe(aggregateErrors, A.map(getErrorMessagesFromAggregateErr), A.flatten);
}

export function parseCmdResponse(cmdResponseObj: CmdResponse): ParsedCmdResponse {
  const { errors: aggregateErrors } = cmdResponseObj;

  return {
    ...cmdResponseObj,
    errors: toErrorMsgs(aggregateErrors),
  };
}

enum LogColor {
  ERROR = 'red',
  WARNING = 'yellow',
  OUTPUT = 'white',
}

export function logErrors(errorMsgs: string[]): IO.IO<void> {
  return () => {
    if (A.isEmpty(errorMsgs)) return;

    const errStr = pipe(errorMsgs, A.map(chalk.red), A.intercalate(S.Monoid)('\n'));

    const title = `${chalk[`${LogColor.ERROR}Bright`].underline.bold(
      'Errors'
    )}(${chalk[LogColor.ERROR].dim.underline(errorMsgs.length)})`;

    console.error('\n');
    console.error(title);
    console.error(errStr);
  };
}

export function logWarnings(warnings: string[]): IO.IO<void> {
  return () => {
    if (A.isEmpty(warnings)) return;

    const warningStr = pipe(
      warnings,
      A.map(chalk.yellow),
      A.intercalate(S.Monoid)('\n')
    );

    const title = `${chalk[`${LogColor.WARNING}Bright`].underline.bold(
      'Warnings'
    )}(${chalk[LogColor.WARNING].dim.underline(warnings.length)})`;

    console.warn('\n');
    console.warn(title);
    console.warn(warningStr);
  };
}

export function logOutput(outputMsgs: string[]): IO.IO<void> {
  return () => {
    if (A.isEmpty(outputMsgs)) return;

    const outputStr = pipe(outputMsgs, A.intercalate(S.Monoid)('\n'));

    const title = `${chalk[`${LogColor.OUTPUT}Bright`].underline.bold(
      'Output'
    )}(${chalk[LogColor.OUTPUT].dim.underline(outputMsgs.length)})`;

    console.log('\n');
    console.log(title);
    console.log(outputStr);
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

export function getCliInputsArrFromArgv(argv: string[]): CliInputs {
  const INDEX_OF_CLI_ARGS = 2;
  return pipe(argv, slice(INDEX_OF_CLI_ARGS, Infinity)<string>, toCliInputs);
}

export function emptyLog(_?: unknown): IO.IO<void> {
  return () => console.log();
}

export function reArrangeCmdResponseTypeOrder(
  cmdResponse: ParsedCmdResponse
): ParsedCmdResponse {
  const { errors, output, warnings } = cmdResponse;
  return {
    errors,
    warnings,
    output,
  };
}

export function arrayToList(arr: string[]): string {
  const arrCopy = [...arr];

  switch (arrCopy.length) {
    case 0:
      return '';

    case 1:
      return arrCopy[0];

    case 2:
      return `${arrCopy[0]} and ${arrCopy[1]}`;

    case 3:
      return `${arrCopy[0]}, ${arrCopy[1]}, and ${arrCopy[2]}`;

    default: {
      const [elemOne, elemTwo, elemThree, ...rest] = arrCopy;
      return `${elemOne}, ${elemTwo}, ${elemThree}, and ${rest.length} other(s)`;
    }
  }
}

type Paths = string[];

export function removeCommonPathSegment(paths: Paths) {
  // Solution Derived from https://rosettacode.org/wiki/Find_common_directory_path#JavaScript

  const commonPathSegment = getCommonPathSegment(paths);
  return pipe(paths, A.map(S.replace(commonPathSegment, '')));
}

function getCommonPathSegment(paths: Paths): string {
  const PATH_DELIMITER = '/';

  return pipe(
    paths,
    A.map(nonEmptyArraySplit(PATH_DELIMITER)),
    transpose,
    A.filter(allElementsAreEqual),
    A.map(a => a[0]),
    A.intercalate(S.Monoid)(PATH_DELIMITER)
  );
}

function nonEmptyArraySplit(separator: string) {
  return (str: string) => str.split(separator) as NEA.NonEmptyArray<string>;
}

function allElementsAreEqual<T>(arr: T[]): boolean {
  return pipe(
    arr,
    A.every(element => element === arr[0])
  );
}

export function removeLeadingPathSeparator(
  strWithLeadingPathSeparator: string
): string {
  const LEADING_PATH_SEPARATOR_REGEX = /^\/+/;

  return pipe(
    strWithLeadingPathSeparator,
    S.replace(LEADING_PATH_SEPARATOR_REGEX, '')
  );
}

export function indentText(indentSize: number = 17) {
  return (text: string) => text.trim().padStart(indentSize);
}
