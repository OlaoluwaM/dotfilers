import * as d from 'io-ts/lib/Decoder';
import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as TE from 'fp-ts/lib/TaskEither';
import * as Sep from 'fp-ts/lib/Separated';

import path from 'path';
import isGlob from 'is-glob';
import micromatch from 'micromatch';

import { match, P } from 'ts-pattern';
import { MonoidAny } from 'fp-ts/lib/boolean';
import { flow, pipe } from 'fp-ts/lib/function';
import { DestinationPathDecoder } from './decoders';
import { newAggregateError, addError } from '@utils/AggregateError';
import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import { compose, lensProp, omit, pick, view } from 'ramda';
import { readJson, doesPathExist, getOnlyValueFromEntriesArr } from '@utils/index';
import {
  getPathToDotfilesDir,
  getAllOperableFilesFromConfigGroupDir,
} from './helpers';
import {
  NOT_FOUND,
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../constants';
import {
  File,
  AnyObject,
  SourcePath,
  FileRecord,
  ConfigGroup,
  PartialFile,
  DestinationPath,
  toDestinationPath,
  DestinationRecord,
  PartialConfigGroup,
  DestinationRecordValue,
  FixedDestinationRecordKeys,
  PartialDestinationRecord,
} from '@types';

export default function createConfigGroups(configGroupNamesOrPaths: string[]) {
  return pipe(
    configGroupNamesOrPaths,
    A.wilt(T.ApplicativePar)(transformAConfigGroupNameIntoAConfigGroupObj)
  );
}

type ConfigGroupName = string;
function transformAConfigGroupNameIntoAConfigGroupObj(
  configGroupNameOrPath: ConfigGroupName
) {
  return pipe(
    configGroupNameOrPath,
    generateAbsolutePathToConfigGroupDir,
    TE.fromOption(() => newAggregateError('')),
    TE.chain(doesPathExist),
    TE.mapLeft(generateConfigGroupDirPathValidityErr(configGroupNameOrPath)),
    TE.chain(generateConfigGroup)
  );
}

export function generateAbsolutePathToConfigGroupDir(
  configGroupNameOrPath: ConfigGroupName
) {
  return pipe(
    configGroupNameOrPath,
    O.fromPredicate(path.isAbsolute),
    O.match(
      flow(
        getPathToDotfilesDir,
        O.map(dotfilesDirPath => path.join(dotfilesDirPath, configGroupNameOrPath))
      ),
      O.some
    )
  );
}

function generateConfigGroupDirPathValidityErr(configGroupName: ConfigGroupName) {
  return addError(
    `It looks like the '${configGroupName}' config group does not exist. Is the required environment variable (${SHELL_VARS_TO_CONFIG_GRP_DIRS_STR}) set?`
  );
}

type ConfigGroupDirPath = string;
function generateConfigGroup(configGroupPath: ConfigGroupDirPath) {
  return pipe(
    generatePartialConfigGroup(configGroupPath),
    includeDestinationRecord(configGroupPath),
    TE.map(includeAdditionalMetaDataToConfigGroup)
  );
}

type PartialConfigGroupObjCreator = TE.TaskEither<never, PartialConfigGroup>;
function generatePartialConfigGroup(configGroupDirPath: ConfigGroupDirPath) {
  return pipe(
    getAllOperableFilesFromConfigGroupDir(configGroupDirPath),
    T.map(filesFromConfigGroupPath => ({
      files: filesFromConfigGroupPath,

      fileRecord: pipe(
        filesFromConfigGroupPath,
        A.reduce({} as FileRecord, fromFileArrToFileRecord)
      ),
    })),
    TE.rightTask
  ) as PartialConfigGroupObjCreator;
}

function fromFileArrToFileRecord(
  initialFileRecord: PartialConfigGroup['fileRecord'],
  currentFile: PartialFile
) {
  initialFileRecord[currentFile.name] = currentFile;
  return initialFileRecord;
}

type RawDestinationRecord = AnyObject;
function includeDestinationRecord(configGroupDirPath: ConfigGroupDirPath) {
  return (partialConfigGroupObjCreator: PartialConfigGroupObjCreator) =>
    pipe(
      readJson<RawDestinationRecord>(
        path.join(configGroupDirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME)
      ),
      TE.map(
        compose(
          expandDestinationRecordFileNameKeysToAbsPaths(configGroupDirPath),
          parseRawDestinationRecord
        )
      ),
      TE.chainW(
        addDestinationRecordToPartialConfigGroup(partialConfigGroupObjCreator)
      ),
      TE.mapLeft(generateDestinationRecordParsingError(configGroupDirPath))
    );
}

function parseRawDestinationRecord(rawDestinationRecord: RawDestinationRecord) {
  return pipe(
    rawDestinationRecord,
    decodeRawDestinationRecord,
    fillInDefaultValuesInPartialDestinationRecord
  );
}

function decodeRawDestinationRecord(
  rawDestinationRecord: RawDestinationRecord
): PartialDestinationRecord {
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
  partialDestinationRecord: PartialDestinationRecord
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
  configGroupDirPath: ConfigGroupDirPath
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

    const expandNonGlobKeys =
      createNonGlobDestinationRecordKeysExpander(configGroupDirPath);
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

function createNonGlobDestinationRecordKeysExpander(
  configGroupDirPath: ConfigGroupDirPath
) {
  return (destinationRecordKey: string) => {
    if (isGlob(destinationRecordKey)) return destinationRecordKey;
    return path.join(configGroupDirPath, destinationRecordKey);
  };
}

function addDestinationRecordToPartialConfigGroup(
  partialConfigGroupObjCreator: PartialConfigGroupObjCreator
) {
  return (destinationRecord: DestinationRecord) =>
    pipe(
      partialConfigGroupObjCreator,
      TE.map(
        partialConfigGroupObj =>
          ({
            ...partialConfigGroupObj,
            destinationRecord,
          } as Required<PartialConfigGroup>)
      )
    );
}

function generateDestinationRecordParsingError(configGroupPath: string) {
  return addError(
    `Error, could not parse the ${CONFIG_GRP_DEST_RECORD_FILE_NAME} file at the ${configGroupPath} path`
  );
}

type FileInfo = [string, SourcePath];
function includeAdditionalMetaDataToConfigGroup(
  configGroup: Required<PartialConfigGroup>
) {
  const { fileRecord, destinationRecord } = configGroup;
  const configGroupOperatorFn = generateConfigGroupObjOperatorFn(destinationRecord);

  const determineIfFileShouldBeIgnored = configGroupOperatorFn(
    determineFileIgnoreStatus
  );
  const computeFileDestinationPath = configGroupOperatorFn(
    determineFileDestinationPath
  );

  const newFileRecordPropWithIgnoreStatusAndDestPath = pipe(
    fileRecord,
    R.map(fileRecordPropEntry => {
      const fileInfo = [
        fileRecordPropEntry.name,
        fileRecordPropEntry.sourcePath,
      ] as FileInfo;

      return {
        ...fileRecordPropEntry,
        ignore: determineIfFileShouldBeIgnored(fileInfo),

        destinationPath: pipe(
          fileInfo,
          computeFileDestinationPath,
          (incompleteAbsDestinationPath: DestinationPath) =>
            path.join(incompleteAbsDestinationPath, fileRecordPropEntry.basename)
        ) as DestinationPath,
      };
    })
  ) as ConfigGroup['fileRecord'];

  return {
    ...configGroup,
    files: generateFilesArrFromFileRecord(
      newFileRecordPropWithIgnoreStatusAndDestPath
    ),
    fileRecord: newFileRecordPropWithIgnoreStatusAndDestPath,
  } as ConfigGroup;
}

type MatchingGlobPattern = string | typeof NOT_FOUND;
function generateConfigGroupObjOperatorFn(destinationRecord: DestinationRecord) {
  return <RT>(
    fn: (
      destinationRecord: DestinationRecord,
      fileInfo: FileInfo,
      matchingGlobPatternForFileName: MatchingGlobPattern
    ) => RT
  ) => {
    const fileNameGlobMatchRetriever = createGlobMatchRetriever(destinationRecord);

    return (fileInfo: FileInfo): RT =>
      fn(destinationRecord, fileInfo, fileNameGlobMatchRetriever(fileInfo));
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

  return ([fileName]: FileInfo): MatchingGlobPattern => {
    let matchingGlobPattern: MatchingGlobPattern = NOT_FOUND;

    const onMatch = ({ glob }: { glob: string }) => {
      matchingGlobPattern = glob;
    };

    micromatch.isMatch(fileName, allSpecifiedGlobPatterns, { onMatch });

    return matchingGlobPattern;
  };
}

function generateFilesArrFromFileRecord(fileRecord: FileRecord): File[] {
  return pipe(fileRecord, R.toArray, A.map(getOnlyValueFromEntriesArr));
}

export function getFilesFromConfigGroup(configGroupObj: ConfigGroup) {
  const filesLens = lensProp<ConfigGroup, 'files'>('files');
  return view(filesLens, configGroupObj);
}

export function isNotIgnored(fileObj: File): boolean {
  return fileObj.ignore === false;
}

export const DEFAULT_DEST_RECORD_FILE_CONTENTS = { '!': '*' };
