import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as R from 'fp-ts/lib/Record';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RNEA from 'fp-ts/lib/ReadonlyNonEmptyArray';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { AbsFilePathDecoder } from './decoders';
import { newAggregateError, addError } from '@utils/AggregateError';
import { compose, lensProp, omit, pick, view } from 'ramda';
import {
  isValidShellExpansion,
  expandShellVariablesInString,
  resolvePathToDestinationFile,
} from './helpers';
import {
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  CONFIG_GRP_DEST_MAP_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../constants';
import {
  readJson,
  doesPathExist,
  getAllFilesFromDirectory,
  getOnlyValueFromEntriesArr,
  transformNonStringPrimitivesToStrings,
} from '@utils/index';
import {
  File,
  Files,
  RawFile,
  ConfigGroup,
  FileRecord,
  DestinationRecord,
  DestinationRecordWithoutIgnoreInfo,
} from '@types';

export default function createConfigGrps(configGrpNames: string[]) {
  return pipe(
    configGrpNames,
    A.wilt(T.ApplicativePar)(transformAConfigGrpNameIntoAConfigGrpObj)
  );
}

function transformAConfigGrpNameIntoAConfigGrpObj(configGrpName: string) {
  return pipe(
    configGrpName,
    generateAbsolutePathToConfigGrpDir,
    TE.fromOption(() => newAggregateError('')),
    TE.chain(doesPathExist),
    TE.mapLeft(handleConfigGrpDirPathValidityErr(configGrpName)),
    TE.chain(generateConfigGrp)
  );
}

function generateAbsolutePathToConfigGrpDir(configGrpName: string) {
  return pipe(
    configGrpName,
    generateConfigGrpNamePathWithShellVars,
    RNEA.map(expandShellVariablesInString),
    RA.filter(not(isValidShellExpansion)),
    RA.head
  );
}

function handleConfigGrpDirPathValidityErr(configGrpName: string) {
  return addError(
    `It looks like the '${configGrpName}' config group does not exist. Is the required environment variable (${SHELL_VARS_TO_CONFIG_GRP_DIRS_STR}) set?`
  );
}

function generateConfigGrp(configGrpPath: string) {
  return pipe(
    generatePartialConfigGrp(configGrpPath),
    includeDestinationRecord(configGrpPath),
    TE.map(includeRequiredMetaDataInConfigGrp)
  );
}

type PartialConfigGrp = Omit<ConfigGroup, 'destinationRecord'>;
type PartialConfigGrpObjCreator = TE.TaskEither<never, PartialConfigGrp>;

function generatePartialConfigGrp(configGrpPath: string) {
  const getNormalizedFilesFromConfigGrpPathDir = pipe(
    getAllFilesFromDirectory(configGrpPath),
    T.map(A.map(fromRawFileToFile))
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

function fromRawFileToFile(curr: RawFile) {
  const updatedFileObj = R.deleteAt('dirent')({ ...curr }) as File;
  return updatedFileObj;
}

function fromFileArrToFileRecord(initialFileRecord: FileRecord, currentFile: File) {
  initialFileRecord[currentFile.name] = currentFile;
  return initialFileRecord;
}

function includeDestinationRecord(configGrpPath: string) {
  return (partialConfigGrpObjCreator: PartialConfigGrpObjCreator) =>
    pipe(
      readJson<DestinationRecord>(
        `${configGrpPath}/${CONFIG_GRP_DEST_MAP_FILE_NAME}`
      ),
      TE.map(parseDestinationRecord),
      TE.chainW(
        addDestinationRecordToPartialConfigGroup(partialConfigGrpObjCreator)
      ),
      TE.mapLeft(handleDestinationRecordParseError(configGrpPath))
    );
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
    `Error, could not parse the ${CONFIG_GRP_DEST_MAP_FILE_NAME} file at the ${configGrpPath} path`
  );
}

function parseDestinationRecord(rawDestinationRecord: DestinationRecord) {
  return pipe(
    rawDestinationRecord,
    generateParsedDestinationRecord(
      compose(
        decodeDestinationRecordEntries,
        attemptToExpandDestinationRecordEntryValues()
      )
    )
  );
}

type DestinationRecordOperatorFn = (
  destinationRecord: DestinationRecordWithoutIgnoreInfo
) => DestinationRecordWithoutIgnoreInfo;

function generateParsedDestinationRecord(operatorFn: DestinationRecordOperatorFn) {
  return (originalDestinationRecord: DestinationRecord) => {
    const destinationRecordWithoutIgnoreInfo = omit(
      [EXCLUDE_KEY],
      originalDestinationRecord
    ) as DestinationRecordWithoutIgnoreInfo;

    const destinationRecordIgnoreInfo = pick(
      [EXCLUDE_KEY],
      originalDestinationRecord
    ) as Pick<DestinationRecord, typeof EXCLUDE_KEY>;

    const finalDestinationRecord = operatorFn(destinationRecordWithoutIgnoreInfo);

    return {
      ...finalDestinationRecord,
      ...destinationRecordIgnoreInfo,
    } as DestinationRecord;
  };
}

function attemptToExpandDestinationRecordEntryValues() {
  return R.map(
    compose(expandShellVariablesInString, transformNonStringPrimitivesToStrings)
  );
}

function decodeDestinationRecordEntries(
  destinationRecord: DestinationRecordWithoutIgnoreInfo
): DestinationRecordWithoutIgnoreInfo {
  return pipe(destinationRecord, R.filter(isInvalidAbsFilePath));
}

function isInvalidAbsFilePath(destinationPath: string) {
  return E.isRight(AbsFilePathDecoder.decode(destinationPath));
}

function includeRequiredMetaDataInConfigGrp(configGrp: ConfigGroup) {
  const { fileRecord, destinationRecord } = configGrp;
  const configGrpOperatorFn = generateConfigGrpObjOperatorFn(destinationRecord);

  const determineIfFileShouldBeIgnored = configGrpOperatorFn(
    determineFileIgnoreStatus
  );
  const computeFileDestinationPath = configGrpOperatorFn(
    determineFileDestinationPath
  );

  const newFileRecordPropWithIgnoreStatusAndDestPath = R.map<File, File>(
    fileRecordPropEntry => ({
      ...fileRecordPropEntry,
      ignore: determineIfFileShouldBeIgnored(fileRecordPropEntry.name),

      destinationPath: pipe(
        fileRecordPropEntry.name,
        computeFileDestinationPath,
        resolvePathToDestinationFile(fileRecordPropEntry.name)
      ),
    })
  )(fileRecord) as ConfigGroup['fileRecord'];

  return {
    ...configGrp,
    files: generateFilesArrFromFileRecord(
      newFileRecordPropWithIgnoreStatusAndDestPath
    ),
    fileRecord: newFileRecordPropWithIgnoreStatusAndDestPath,
  };
}

function generateConfigGrpObjOperatorFn(destinationRecord: DestinationRecord) {
  return <RT>(fn: (destinationRecord: DestinationRecord, fileName: string) => RT) =>
    (fileName: string): RT =>
      fn(destinationRecord, fileName);
}

function determineFileIgnoreStatus(
  destinationRecord: DestinationRecord,
  fileName: string
) {
  const namesOfFilesToIgnore = destinationRecord?.[EXCLUDE_KEY];
  const ignoreAllFiles = namesOfFilesToIgnore === ALL_FILES_CHAR;
  if (ignoreAllFiles) return true;

  return namesOfFilesToIgnore === undefined
    ? false
    : RA.elem(S.Eq)(fileName)(namesOfFilesToIgnore);
}

function determineFileDestinationPath(
  destinationRecord: DestinationRecord,
  fileName: string
): string {
  const HOME_DIR = expandShellVariablesInString('$HOME');

  return (
    destinationRecord[fileName] ?? destinationRecord[ALL_FILES_CHAR] ?? HOME_DIR
  );
}

function generateFilesArrFromFileRecord(fileRecord: FileRecord): Files {
  return pipe(fileRecord, R.toArray, A.map(getOnlyValueFromEntriesArr));
}

export function generateConfigGrpNamePathWithShellVars(configGrpName: string) {
  return pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RA.map(shellVar => `${shellVar}/${configGrpName}`)
  ) as readonly [string, string];
}

export function getFilesFromConfigGrp(configGrpObj: ConfigGroup) {
  const filesLens = lensProp<ConfigGroup, 'files'>('files');
  return view(filesLens, configGrpObj);
}

export function isNotIgnored(fileObj: File): boolean {
  return fileObj.ignore === false;
}
