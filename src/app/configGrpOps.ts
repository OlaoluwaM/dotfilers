import * as d from 'io-ts/lib/Decoder';
import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as R from 'fp-ts/lib/Record';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as TE from 'fp-ts/lib/TaskEither';
import * as Sep from 'fp-ts/lib/Separated';
import * as RNEA from 'fp-ts/lib/ReadonlyNonEmptyArray';

import path from 'path';
import isGlob from 'is-glob';
import micromatch from 'micromatch';

import { not } from 'fp-ts/lib/Predicate';
import { match, P } from 'ts-pattern';
import { MonoidAny } from 'fp-ts/lib/boolean';
import { pipe } from 'fp-ts/lib/function';
import { DestinationPathDecoder } from './decoders';
import { getAllFilesFromDirectory } from './helpers';
import { newAggregateError, addError } from '@utils/AggregateError';
import { compose, lensProp, omit, pick, view } from 'ramda';
import {
  isValidShellExpansion,
  expandShellVariablesInString,
} from '@lib/shellVarStrExpander';
import {
  readJson,
  doesPathExist,
  getOnlyValueFromEntriesArr,
  removeLeadingPathSeparator,
} from '@utils/index';
import {
  NOT_FOUND,
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../constants';
import {
  File,
  Files,
  RawFile,
  AnyObject,
  SourcePath,
  FileRecord,
  ConfigGroup,
  DestinationPath,
  toDestinationPath,
  DestinationRecord,
  DestinationRecordValue,
  FixedDestinationRecordKeys,
} from '@types';

export default function createConfigGrps(configGrpNames: string[]) {
  return pipe(
    configGrpNames,
    A.wilt(T.ApplicativePar)(transformAConfigGrpNameIntoAConfigGrpObj)
  );
}

type ConfigGrpName = string;
function transformAConfigGrpNameIntoAConfigGrpObj(configGrpName: ConfigGrpName) {
  return pipe(
    configGrpName,
    generateAbsolutePathToConfigGrpDir,
    TE.fromOption(() => newAggregateError('')),
    TE.chain(doesPathExist),
    TE.mapLeft(handleConfigGrpDirPathValidityErr(configGrpName)),
    TE.chain(generateConfigGrp)
  );
}

export function generateAbsolutePathToConfigGrpDir(configGrpName: ConfigGrpName) {
  const generateConfigGrpNameAbsPath = compose(
    expandedPath => path.join(expandedPath, configGrpName),
    expandShellVariablesInString
  );

  return pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RNEA.map(generateConfigGrpNameAbsPath),
    RA.filter(not(isValidShellExpansion)),
    RA.head
  );
}

function handleConfigGrpDirPathValidityErr(configGrpName: ConfigGrpName) {
  return addError(
    `It looks like the '${configGrpName}' config group does not exist. Is the required environment variable (${SHELL_VARS_TO_CONFIG_GRP_DIRS_STR}) set?`
  );
}

type ConfigGrpPath = string;
function generateConfigGrp(configGrpPath: ConfigGrpPath) {
  return pipe(
    generatePartialConfigGrp(configGrpPath),
    includeDestinationRecord(configGrpPath),
    TE.map(includeRequiredMetaDataInConfigGrp)
  );
}

type PartialConfigGrp = Omit<ConfigGroup, 'destinationRecord'>;
type PartialConfigGrpObjCreator = TE.TaskEither<never, PartialConfigGrp>;
function generatePartialConfigGrp(configGrpPath: ConfigGrpPath) {
  const getNormalizedFilesFromConfigGrpPathDir = pipe(
    getAllFilesFromDirectory(configGrpPath),
    T.map(A.map(fromRawFileToFile(configGrpPath)))
  );

  return pipe(
    getNormalizedFilesFromConfigGrpPathDir,
    T.map(parsedFilesFromConfigGrpPathDir => ({
      files: parsedFilesFromConfigGrpPathDir,

      fileRecord: pipe(
        parsedFilesFromConfigGrpPathDir,
        A.reduce({} as FileRecord, fromFileArrToFileRecord)
      ),
    })),
    TE.rightTask
  ) as PartialConfigGrpObjCreator;
}

function fromRawFileToFile(configGrpPath: ConfigGrpPath) {
  return (curr: RawFile) => {
    const updatedFileObj = R.deleteAt('dirent')({ ...curr }) as File;
    updatedFileObj.name = pipe(
      updatedFileObj.path,
      S.replace(configGrpPath, ''),
      removeLeadingPathSeparator
    );

    return updatedFileObj;
  };
}

function fromFileArrToFileRecord(initialFileRecord: FileRecord, currentFile: File) {
  initialFileRecord[currentFile.name] = currentFile;
  return initialFileRecord;
}

type RawDestinationRecord = AnyObject;
function includeDestinationRecord(configGrpPath: ConfigGrpPath) {
  return (partialConfigGrpObjCreator: PartialConfigGrpObjCreator) =>
    pipe(
      readJson<RawDestinationRecord>(
        path.join(configGrpPath, CONFIG_GRP_DEST_RECORD_FILE_NAME)
      ),
      TE.map(
        compose(
          expandDestinationRecordFileNameKeysToAbsPaths(configGrpPath),
          parseRawDestinationRecord
        )
      ),
      TE.chainW(
        addDestinationRecordToPartialConfigGroup(partialConfigGrpObjCreator)
      ),
      TE.mapLeft(handleDestinationRecordParseError(configGrpPath))
    );
}

function parseRawDestinationRecord(rawDestinationRecord: RawDestinationRecord) {
  return pipe(
    rawDestinationRecord,
    decodeRawDestinationRecord,
    fillInDefaultValuesInPartialDestinationRecord
  );
}

function decodeRawDestinationRecord(rawDestinationRecord: RawDestinationRecord) {
  const ExcludeKeyDecoder = d.union(d.literal(ALL_FILES_CHAR), d.array(d.string));

  const rawDestinationRecordDecodeResult = pipe(
    rawDestinationRecord,
    R.mapWithIndex((key, value) =>
      match(key)
        .with(EXCLUDE_KEY, () => ExcludeKeyDecoder.decode(value))
        .with(P.union(ALL_FILES_CHAR, P.string), () =>
          DestinationPathDecoder.decode(value)
        )
        .exhaustive()
    )
  ) as Record<string, E.Either<d.DecodeError, DestinationRecordValue>>;

  return pipe(rawDestinationRecordDecodeResult, R.separate, Sep.right);
}

function fillInDefaultValuesInPartialDestinationRecord(
  partialDestinationRecord: Record<string, DestinationRecordValue>
) {
  const HOME_DIR = expandShellVariablesInString('$HOME');

  const DEFAULT_DESTINATION_RECORD = {
    [EXCLUDE_KEY]: [] as string[],
    [ALL_FILES_CHAR]: toDestinationPath(HOME_DIR),
  } as Pick<DestinationRecord, FixedDestinationRecordKeys>;

  return {
    ...DEFAULT_DESTINATION_RECORD,
    ...partialDestinationRecord,
  } as DestinationRecord;
}

function expandDestinationRecordFileNameKeysToAbsPaths(
  configGrpPath: ConfigGrpPath
) {
  return (destinationRecord: DestinationRecord) => {
    const destinationRecordWithOnlyFileNameKeys = omit(
      [EXCLUDE_KEY, ALL_FILES_CHAR],
      destinationRecord
    );
    const destinationRecordWithoutFileNameKeys = pick(
      [EXCLUDE_KEY, ALL_FILES_CHAR],
      destinationRecord
    ) as Pick<DestinationRecord, FixedDestinationRecordKeys>;

    const expandNonGlobKeys = expandNonGlobDestinationRecordKeys(configGrpPath);
    const destinationRecordWithExpandedPathValues = pipe(
      destinationRecordWithOnlyFileNameKeys,
      R.toEntries,
      A.map(
        ([fileName, destinationPath]) =>
          [expandNonGlobKeys(fileName), destinationPath] as [string, DestinationPath]
      ),
      R.fromEntries
    );

    return {
      ...destinationRecordWithExpandedPathValues,
      ...destinationRecordWithoutFileNameKeys,
    } as DestinationRecord;
  };
}

function expandNonGlobDestinationRecordKeys(configGrpPath: ConfigGrpPath) {
  return (destinationRecordKey: string) => {
    if (isGlob(destinationRecordKey)) return destinationRecordKey;
    return path.join(configGrpPath, destinationRecordKey);
  };
}

function addDestinationRecordToPartialConfigGroup(
  partialConfigGrpObjCreator: PartialConfigGrpObjCreator
) {
  return (destinationRecord: DestinationRecord) =>
    pipe(
      partialConfigGrpObjCreator,
      TE.map(
        partialConfigObj =>
          ({ ...partialConfigObj, destinationRecord } as ConfigGroup)
      )
    );
}

function handleDestinationRecordParseError(configGrpPath: string) {
  return addError(
    `Error, could not parse the ${CONFIG_GRP_DEST_RECORD_FILE_NAME} file at the ${configGrpPath} path`
  );
}

type FileInfo = [string, SourcePath];
function includeRequiredMetaDataInConfigGrp(configGrp: ConfigGroup) {
  const { fileRecord, destinationRecord } = configGrp;
  const configGrpOperatorFn = generateConfigGrpObjOperatorFn(destinationRecord);

  const determineIfFileShouldBeIgnored = configGrpOperatorFn(
    determineFileIgnoreStatus
  );
  const computeFileDestinationPath = configGrpOperatorFn(
    determineFileDestinationPath
  );

  const newFileRecordPropWithIgnoreStatusAndDestPath = pipe(
    fileRecord,
    R.map<File, File>(fileRecordPropEntry => {
      const fileInfo = [
        fileRecordPropEntry.name,
        fileRecordPropEntry.path,
      ] as FileInfo;

      return {
        ...fileRecordPropEntry,
        ignore: determineIfFileShouldBeIgnored(fileInfo),

        destinationPath: pipe(
          fileInfo,
          computeFileDestinationPath,
          (incompleteAbsDestinationPath: DestinationPath) =>
            path.join(incompleteAbsDestinationPath, path.basename(fileInfo[0]))
        ) as DestinationPath,
      };
    })
  ) as ConfigGroup['fileRecord'];

  return {
    ...configGrp,
    files: generateFilesArrFromFileRecord(
      newFileRecordPropWithIgnoreStatusAndDestPath
    ),
    fileRecord: newFileRecordPropWithIgnoreStatusAndDestPath,
  };
}

type MatchingGlobPattern = string | typeof NOT_FOUND;
function generateConfigGrpObjOperatorFn(destinationRecord: DestinationRecord) {
  return <RT>(
    fn: (
      destinationRecord: DestinationRecord,
      fileInfo: FileInfo,
      matchingGlobPatternForFileName: MatchingGlobPattern
    ) => RT
  ) => {
    const fileNameGlobMatchRetriever = createGlobMatchRetriever(destinationRecord);

    return (fileInfo: FileInfo): RT =>
      fn(destinationRecord, fileInfo, fileNameGlobMatchRetriever(fileInfo[0]));
  };
}

function determineFileIgnoreStatus(
  destinationRecord: DestinationRecord,
  [fileName]: FileInfo,
  matchingGlobPatternForFileName: MatchingGlobPattern
) {
  const namesOfFilesToIgnore = destinationRecord[EXCLUDE_KEY];

  const ignoreAllFiles = namesOfFilesToIgnore === ALL_FILES_CHAR;
  if (ignoreAllFiles) return true;

  const globMatchPreposition =
    matchingGlobPatternForFileName === NOT_FOUND
      ? MonoidAny.empty
      : RA.elem(S.Eq)(matchingGlobPatternForFileName)(namesOfFilesToIgnore);

  const isFileIgnored = MonoidAny.concat(
    RA.elem(S.Eq)(fileName)(namesOfFilesToIgnore),
    globMatchPreposition
  );

  return isFileIgnored;
}

function determineFileDestinationPath(
  destinationRecord: DestinationRecord,
  [_, filePath]: FileInfo,
  matchingGlobPatternForFileName: MatchingGlobPattern
) {
  return (
    destinationRecord[filePath] ??
    destinationRecord[matchingGlobPatternForFileName] ??
    destinationRecord[ALL_FILES_CHAR]
  );
}

function createGlobMatchRetriever(destinationRecord: DestinationRecord) {
  const allSpecifiedGlobPatterns = pipe(
    destinationRecord,
    R.filterWithIndex(potentialGlob => isGlob(potentialGlob)),
    R.keys
  );

  return (fileName: string): MatchingGlobPattern => {
    let matchingGlobPattern: MatchingGlobPattern = NOT_FOUND;

    const onMatch = ({ glob }: { glob: string }) => {
      matchingGlobPattern = glob;
    };

    micromatch.isMatch(fileName, allSpecifiedGlobPatterns, { onMatch });

    return matchingGlobPattern;
  };
}

function generateFilesArrFromFileRecord(fileRecord: FileRecord): Files {
  return pipe(fileRecord, R.toArray, A.map(getOnlyValueFromEntriesArr));
}

export function getFilesFromConfigGrp(configGrpObj: ConfigGroup) {
  const filesLens = lensProp<ConfigGroup, 'files'>('files');
  return view(filesLens, configGrpObj);
}

export function isNotIgnored(fileObj: File): boolean {
  return fileObj.ignore === false;
}

export const DEFAULT_DEST_RECORD_FILE_CONTENTS = { '!': '*' };
