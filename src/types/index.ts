import { AggregateError } from '@utils/AggregateError';
import { Entry } from 'fast-glob';
import { Newtype } from 'newtype-ts';
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

export type DestinationRecordWithoutIgnoreInfo = Omit<
  DestinationRecord,
  typeof EXCLUDE_KEY
>;

export interface ConfigGroup {
  readonly files: Files;
  readonly fileRecord: FileRecord;
  readonly destinationRecord: DestinationRecord;
}

export type ConfigGroups = ConfigGroup[];

export type Primitive = string | number | boolean | symbol;

export interface AnyObject<Val = unknown> {
  [key: Exclude<Primitive, boolean>]: Val;
}

export type AnyFunction<RT = unknown> = (...args: any[]) => RT;

export type LinkCmdOperationType = 'hardlink' | 'symlink' | 'copy';

export type isOptional<Structure, MemberUnion extends keyof Structure> = Omit<
  Structure,
  MemberUnion
> &
  Partial<Pick<Structure, MemberUnion>>;

export interface AbsFilePath
  extends Newtype<{ readonly AbsFilePath: unique symbol }, string> {}

export interface CmdResponse<T> {
  errors: AggregateError[] | string[];
  output: string[];
  forTest: T; // NOTE: This return is for testing purposes only
}
