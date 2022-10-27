import { EntryInfo } from 'readdirp';
import { AggregateError } from '@utils/AggregateError';
import { Brand, createBrander } from '@lib/brand';
import { NOT_FOUND, ALL_FILES_CHAR, EXCLUDE_KEY } from '../constants';

export type RawFile = EntryInfo;

export type File = {
  sourcePath: SourcePath;
  name: string;
  basename: string;
  ignore: boolean;
  destinationPath: DestinationPath;
};

export type PartialFile = isOptional<File, 'ignore' | 'destinationPath'>;

export interface FileRecord {
  [key: string]: File;
}

export type DestinationRecord = {
  readonly [fileGlobAndPath: string]: DestinationPath;
  readonly [NOT_FOUND]: null;
} & {
  readonly [ALL_FILES_CHAR]: DestinationPath;
  readonly [EXCLUDE_KEY]: string[] | typeof ALL_FILES_CHAR;
};

export type DestinationRecordValue =
  | DestinationRecord[typeof EXCLUDE_KEY]
  | DestinationRecord[string];

export type DestinationRecordWithoutIgnoreInfo = Omit<
  DestinationRecord,
  typeof EXCLUDE_KEY
>;

export type FixedDestinationRecordKeys = typeof ALL_FILES_CHAR | typeof EXCLUDE_KEY;

export type PartialDestinationRecord = Record<string, DestinationRecordValue>;

export type PartialConfigGroup = {
  readonly files: PartialFile[];
  readonly fileRecord: { [K in keyof FileRecord]: PartialFile };
  readonly destinationRecord?: DestinationRecord;
};

export interface ConfigGroup {
  readonly files: File[];
  readonly fileRecord: FileRecord;
  readonly destinationRecord: DestinationRecord;
}

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

export interface CmdResponse<T> {
  errors: AggregateError[] | string[];
  warnings: string[];
  output: string[];
  forTest: T; // NOTE: This return is for testing purposes only
}

export interface Cmd<RT> {
  (args: string[], cmdOptions: string[]): Promise<CmdResponse<RT>>;
}

export type SourcePath = Brand<string, 'Source Path'>;
export type DestinationPath = Brand<string, 'Destination Path'>;

export const toSourcePath = createBrander<SourcePath>();
export const toDestinationPath = createBrander<DestinationPath>();
