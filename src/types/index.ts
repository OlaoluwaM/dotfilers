import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import { EntryInfo } from 'readdirp';
import { AggregateError } from '@utils/AggregateError';
import { NOT_FOUND, ALL_FILES_CHAR, EXCLUDE_KEY } from '../constants.js';
import { Brand, createBrander, ExcludeNonBrands } from '@lib/brand';

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

export type CurriedReturnType<Fn> = Fn extends AnyFunction
  ? CurriedReturnType<ReturnType<Fn>>
  : Fn;

export interface CmdResponseWithTestOutput<T> {
  errors: AggregateError[];
  warnings: string[];
  output: string[];
  testOutput: T; // NOTE: This property is for testing purposes only
}

export type CmdResponse = Omit<CmdResponseWithTestOutput<unknown>, 'testOutput'> & {
  testOutput: never;
};

export type ParsedCmdResponse = Omit<CmdResponse, 'errors' | 'testOutput'> & {
  errors: string[];
};

// Intersections are due to function arguments being contra-variant
export interface CmdFnWithTestOutput<T> {
  (cmdArguments: PositionalArgs, cmdOptions: CmdOptions): TE.TaskEither<
    IO.IO<never>,
    CmdResponseWithTestOutput<T>
  >;
}

// Intersections are due to function arguments being contra-variant
export interface CmdFn {
  (cmdArguments: PositionalArgs, cmdOptions: CmdOptions): TE.TaskEither<
    IO.IO<never>,
    CmdResponse
  >;
}

export type SourcePath = Brand<string, 'Source Path'>;
export type DestinationPath = Brand<string, 'Destination Path'>;

export type CmdOptions = Brand<string[], 'Command Options'> | [];
export type PositionalArgs = Brand<string[], 'Positional Args'> | [];

export type CliInputs = Brand<string[], 'Parsed Argv'>;

export const toSourcePath = createBrander<SourcePath>();
export const toDestinationPath = createBrander<DestinationPath>();

export const toCmdOptions = createBrander<ExcludeNonBrands<CmdOptions>>();
export const toPositionalArgs = createBrander<ExcludeNonBrands<PositionalArgs>>();

export const toCliInputs = createBrander<CliInputs>();
