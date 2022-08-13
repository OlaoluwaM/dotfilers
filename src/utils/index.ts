import { pipe } from 'fp-ts/lib/function';
import { AnyObject, RawFile } from '@types';
import { fs as fsExtra, globby } from 'zx';
import { CONFIG_GRP_DEST_MAP_FILE_NAME } from '../constants';
import { isEmpty, join, lensIndex, over, slice, uniq } from 'ramda';

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

export function unit<T>(val: T): () => T {
  return () => val;
}

export async function doesPathExist(pathToEntity: string) {
  const pathExists = await fsExtra.pathExists(pathToEntity);
  if (pathExists) return pathToEntity;

  throw newError(`${pathToEntity} does not exist`);
}

export function newError(message: string) {
  return new Error(message);
}

export async function getAllFilesFromDirectory(dirPath: string) {
  return (await globby('**/*', {
    ignore: [CONFIG_GRP_DEST_MAP_FILE_NAME],
    onlyFiles: true,
    cwd: dirPath,
    absolute: true,
    objectMode: true,
    dot: true,
  })) as unknown as RawFile[];
}

export async function readJson<T>(jsonFilePath: string) {
  return (await fsExtra.readJson(jsonFilePath)) as T;
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

class AggregateError extends Error {
  #messages: string[] = [];

  constructor(messages: string[] | string) {
    super();
    this.addError(messages);
  }

  get aggregatedMessages() {
    return this.#messages;
  }

  addError(messages: string[] | string) {
    const newMessagesToAdd: string[] = valueIs.aString(messages) ? [messages] : messages;

    this.#messages = uniq(this.#messages.concat(newMessagesToAdd));
    this.message = `The following errors occurred: ${convertArrToSentence(
      this.#messages
    )}`;
  }
}
export function updateAggregateError(errorInstance: AggregateError) {
  return (message: string | string[]) => errorInstance.addError(message);
}
export function newAggregateError(messages: string | string[]) {
  return new AggregateError(messages);
}

export function convertArrToSentence(arr: string[]) {
  const tailLens = lensIndex<string>(arr.length - 1);

  return pipe(
    over(tailLens, (str: string) => `and ${str}`, arr),
    join(', ')
  );
}
