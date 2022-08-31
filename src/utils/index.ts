import * as A from 'fp-ts/lib/Array';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import boxen from 'boxen';

import { pipe } from 'fp-ts/lib/function';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { AnyObject, Primitive, RawFile } from '@types';
import { filter as recordFilter } from 'fp-ts/lib/Record';
import { chalk, fs as fsExtra, globby } from 'zx';
import { CONFIG_GRP_DEST_MAP_FILE_NAME } from '../constants';
import { AggregateError, newAggregateError } from './AggregateError';
import { mkdir, unlink, link, symlink, readdir } from 'fs/promises';
import { not, isEmpty, slice, lensProp, view, toString } from 'ramda';

export function getCLIArguments(startingInd: number) {
  return slice(startingInd, Infinity)(process.argv);
}

// For debugging purposes only
export function trace<T>(...logContents: string[]) {
  return (val: T) => {
    const otherLogContents = isEmpty(logContents) ? ['Output: '] : logContents;
    console.log(...otherLogContents, val);
    return val;
  };
}

export function id<T>(value: T) {
  return value;
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

export function getAllFilesFromDirectory(dirPath: string): T.Task<RawFile[]> {
  return async () =>
    (await globby('**/*', {
      ignore: [CONFIG_GRP_DEST_MAP_FILE_NAME],
      onlyFiles: true,
      cwd: dirPath,
      absolute: true,
      objectMode: true,
      dot: true,
    })) as unknown as RawFile[];
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

type RawTypes =
  | 'function'
  | 'object'
  | 'array'
  | 'null'
  | 'undefined'
  | 'string'
  | 'number'
  | 'boolean';
export function rawTypeOf(value: unknown): RawTypes {
  return Object.prototype.toString
    .call(value)
    .replace(/\[|\]|object|\s/g, '')
    .toLocaleLowerCase() as RawTypes;
}

export const valueIs = {
  aString(val: unknown): val is string {
    return rawTypeOf(val) === 'string';
  },

  anArray(val: unknown): val is unknown[] {
    return rawTypeOf(val) === 'array';
  },

  anObject(val: unknown): val is AnyObject {
    return rawTypeOf(val) === 'object';
  },

  aNumber(val: unknown): val is number {
    return rawTypeOf(val) === 'number';
  },

  true(val: unknown): val is true {
    return val === true;
  },
};

export function removeEntityAt(
  filePath: string
): TE.TaskEither<AggregateError, void> {
  return TE.tryCatch(
    () => unlink(filePath),
    reason =>
      newAggregateError(
        `Error deleting entity at path ${filePath}: ${(reason as Error).message}`
      )
  );
}

export function createEntityPathIfItDoesNotExist(
  entityPath: string
): T.Task<boolean> {
  return pipe(
    doesPathExist(entityPath),
    TE.fold(
      () => async () => {
        // Because recursive is set to true, the following will not fail, no need for try catch
        // https://nodejs.org/docs/v18.7.0/api/fs.html#fspromisesunlinkpath
        await mkdir(entityPath, { recursive: true });
        return true;
      },
      () => async () => false
    )
  );
}

export function filterFalsyProps<ObjT extends AnyObject<any>>(obj: ObjT) {
  const filterFn = recordFilter((keyVal: boolean) => MonoidAll.concat(true, keyVal));
  return filterFn(obj) as ObjT;
}

export function isNotEmptyObj<Obj extends AnyObject<any>>(
  potentiallyEmptyObj: Obj
): boolean {
  return pipe(potentiallyEmptyObj, isEmpty, not);
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

    console.error(
      boxen(errStr, {
        title: `${chalk.redBright.bold('Errors')}(${chalk.red.dim(
          errorMsgs.length
        )})`,
        padding: 1,
        borderColor: 'red',
      })
    );
  };
}

function getErrorMessagesFromAggregateErr(aggregateErrorObj: AggregateError) {
  const filesLens = lensProp<AggregateError, 'messages'>('messages');
  return view(filesLens, aggregateErrorObj);
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

type FsTask = (sourcePath: string, destinationPath: string) => Promise<void>;
function withOverride(fn: FsTask): FsTask {
  return async (sourcePath: string, destinationPath: string) => {
    try {
      await unlink(destinationPath);
    } catch {
      // We want to ignore the error
    } finally {
      await fn(sourcePath, destinationPath);
    }
  };
}

export const symlinkWithOverride = withOverride(symlink);
export const hardlinkWithOverride = withOverride(link);

export function getAllDirNamesAtFolderPath(folderPath: string) {
  return TE.tryCatch(
    async () => {
      const folderContents = await readdir(folderPath, {
        withFileTypes: true,
      });

      return pipe(
        folderContents,
        A.filter(
          dirent => dirent.isDirectory() && isNotAHiddenDirectory(dirent.name)
        ),
        A.map(({ name: dirName }) => dirName)
      );
    },
    reason => newAggregateError(reason as Error)
  );
}

function isNotAHiddenDirectory(dirName: string) {
  const HIDDEN_FOLDER_REGEX = /^\..*/;
  return !HIDDEN_FOLDER_REGEX.test(dirName);
}

export function transformNonStringPrimitivesToStrings(
  nonStringPrimitives: Primitive
) {
  if (typeof nonStringPrimitives === 'string') return nonStringPrimitives;
  return '';
}
