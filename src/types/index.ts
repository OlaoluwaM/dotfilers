import { Entry } from 'fast-glob';
import { ALL_FILES_CHAR, EXCLUDE_KEY } from '../constants';

export type RawFile = Omit<Entry, 'stats'>;

export type File = Pick<RawFile, 'name' | 'path'> & {
  ignore: boolean;
  destinationPath: string;
};

export type Files = File[];

export interface FileRecord {
  [key: string]: File;
}

export type DestinationRecord = {
  readonly [key: string | typeof ALL_FILES_CHAR]: string;
} & { readonly [EXCLUDE_KEY]?: string[] | typeof ALL_FILES_CHAR };

export interface ConfigGroup {
  readonly files: Files;
  readonly fileRecord: FileRecord;
  readonly destinationRecord: DestinationRecord;
}

export type ConfigGroups = ConfigGroup[];

export type Primitive = string | number | boolean | symbol;

export interface AnyObject {
  [key: Exclude<Primitive, boolean>]: unknown;
}

export type AnyFunction<RT = unknown> = (...args: any[]) => RT;

export type CommandArgs = string[];
