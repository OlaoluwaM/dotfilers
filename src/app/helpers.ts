import * as N from 'fp-ts/lib/number';
import * as Sep from 'fp-ts/lib/Separated';
import * as T from 'fp-ts/lib/Task';
import * as R from 'fp-ts/lib/Record';
import * as S from 'fp-ts/lib/string';
import * as O from 'fp-ts/lib/Option';
import * as E from 'fp-ts/lib/Either';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RA from 'fp-ts/lib/ReadonlyArray';

import path from 'path';
import prompts from 'prompts';

import { Reader } from 'fp-ts/Reader';
import { match } from 'ts-pattern';
import { addError } from '../utils/AggregateError';
import { contramap } from 'fp-ts/lib/Ord';
import { flow, pipe } from 'fp-ts/lib/function';
import { elem, map, reduce } from 'fp-ts/lib/Array';
import { compose, omit, pick, replace } from 'ramda';
import { deleteAt, map as recordMap, toArray } from 'fp-ts/lib/Record';
import {
  readJson,
  getAllFilesFromDirectory,
  getOnlyValueFromEntriesArr,
  getAllDirNamesAtFolderPath,
  transformNonStringPrimitivesToStrings,
  trace,
} from '../utils/index';
import {
  NOT_FOUND,
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  CONFIG_GRP_DEST_MAP_FILE_NAME,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  ExitCodes,
} from '../constants';
import {
  File,
  Files,
  RawFile,
  isOptional,
  FileRecord,
  ConfigGroup,
  DestinationRecord,
  LinkCmdOperationType,
  DestinationRecordWithoutIgnoreInfo,
} from '@types';
import { not } from 'fp-ts/lib/Predicate';
import { AbsFilePathDecoder } from './decoders';

interface ShellVariableMap {
  [variableName: string]: string | undefined;
}

export function expandShellVariablesInString(strWithShellVars: string) {
  return replaceShellVarsInString(process.env)(strWithShellVars);
}

export function replaceShellVarsInString(shellVariableValueMap: ShellVariableMap) {
  const SHELL_ENV_VAR_REGEX =
    /(?:(?:\\{2})*)\$(?:(?:[=|-]?([A-Z0-9_]*[A-Z_]+[A-Z0-9_]*)|(?:{[=|-]?([A-Z0-9_]*[A-Z_]+[A-Z0-9_]*)})))|~/gi;

  return replace(
    SHELL_ENV_VAR_REGEX,
    performSubstitutionOnShellVariables(shellVariableValueMap)
  );
}

function performSubstitutionOnShellVariables(
  shellVariableValueMap: ShellVariableMap
) {
  return (shellVarStr: string) =>
    pipe(
      shellVariableValueMap,
      resolveShellVariable(shellVarStr),
      O.getOrElse(() => NOT_FOUND)
    );
}

function resolveShellVariable(stringifiedShellVar: string) {
  return compose(
    determineShellVariableValues,
    resolveTildeAliasIfNeeded
  )(stringifiedShellVar);
}

function resolveTildeAliasIfNeeded(possibleTildeAlias: string) {
  if (possibleTildeAlias === '~') return '$HOME';
  return possibleTildeAlias;
}

function determineShellVariableValues(strWithShellVars: string) {
  const CURLY_BRACKET_REGEX = /[\{\}]/g;

  return pipe(
    strWithShellVars,
    S.slice(1, Infinity),
    replace(CURLY_BRACKET_REGEX, ''),
    lookupShellVariableValues
  );
}

export const getEnv = (potentialShellVariable: string) =>
  lookupShellVariableValues(potentialShellVariable)(process.env);

function lookupShellVariableValues(
  potentialShellVariable: string
): Reader<ShellVariableMap, O.Option<string>> {
  return shellVariableValueMap =>
    pipe(
      O.fromNullable(shellVariableValueMap[potentialShellVariable]),
      O.filter(not(S.isEmpty))
    );
}

export const isValidShellExpansion = S.includes(NOT_FOUND);

export function createConfigGrpFromConfigGrpPath(configGrpPath: string) {
  const getNormalizedFilesFromConfigGrpPathDir = pipe(
    getAllFilesFromDirectory(configGrpPath),
    T.map(map(fromRawFileToFile))
  );

  const partialConfigGrpObjCreator: TE.TaskEither<
    never,
    isOptional<ConfigGroup, 'destinationRecord'>
  > = pipe(
    getNormalizedFilesFromConfigGrpPathDir,
    T.map(parsedFilesFromConfigGrpPathDir => ({
      files: parsedFilesFromConfigGrpPathDir,

      fileRecord: pipe(
        parsedFilesFromConfigGrpPathDir,
        reduce({} as FileRecord, fromFileArrToFileRecord)
      ),
    })),
    TE.rightTask
  );

  return pipe(
    readJson<DestinationRecord>(`${configGrpPath}/${CONFIG_GRP_DEST_MAP_FILE_NAME}`),
    TE.map(parseDestinationRecord),
    TE.chainW(destinationRecord =>
      pipe(
        partialConfigGrpObjCreator,
        TE.map(
          partialConfigObj =>
            ({ ...partialConfigObj, destinationRecord } as ConfigGroup)
        )
      )
    ),
    TE.mapLeft(
      addError(
        `Error, could not parse the ${CONFIG_GRP_DEST_MAP_FILE_NAME} file at the ${configGrpPath} path`
      )
    )
  );
}

function fromRawFileToFile(curr: RawFile) {
  const updatedFileObj = deleteAt('dirent')({ ...curr }) as File;
  return updatedFileObj;
}

function fromFileArrToFileRecord(initialFileRecord: FileRecord, currentFile: File) {
  initialFileRecord[currentFile.name] = currentFile;
  return initialFileRecord;
}

function parseDestinationRecord(rawDestinationRecord: DestinationRecord) {
  return pipe(
    rawDestinationRecord,
    generateDestinationRecordOperatorFn(
      compose(
        decodeDestinationRecordEntries,
        attemptToExpandDestinationRecordEntryValues()
      )
    )
  );
}

function attemptToExpandDestinationRecordEntryValues() {
  return R.map(
    compose(expandShellVariablesInString, transformNonStringPrimitivesToStrings)
  );
}

type DestinationRecordMapperFn = (
  destinationRecord: DestinationRecordWithoutIgnoreInfo
) => DestinationRecordWithoutIgnoreInfo;

function generateDestinationRecordOperatorFn(fn: DestinationRecordMapperFn) {
  return (originalDestinationRecord: DestinationRecord) => {
    const destinationRecordWithoutIgnoreInfo = omit(
      [EXCLUDE_KEY],
      originalDestinationRecord
    ) as DestinationRecordWithoutIgnoreInfo;

    const destinationRecordIgnoreInfo = pick(
      [EXCLUDE_KEY],
      originalDestinationRecord
    ) as Pick<DestinationRecord, typeof EXCLUDE_KEY>;

    const finalDestinationRecord = fn(destinationRecordWithoutIgnoreInfo);

    return {
      ...finalDestinationRecord,
      ...destinationRecordIgnoreInfo,
    } as DestinationRecord;
  };
}

function decodeDestinationRecordEntries(
  destinationRecord: DestinationRecordWithoutIgnoreInfo
): DestinationRecordWithoutIgnoreInfo {
  return pipe(destinationRecord, R.filter(isInvalidAbsFilePath));
}

function isInvalidAbsFilePath(destinationPath: string) {
  return E.isRight(AbsFilePathDecoder.decode(destinationPath));
}

export function updateConfigGrpObjWithNecessaryMetaData(configGrp: ConfigGroup) {
  const { fileRecord, destinationRecord } = configGrp;
  const configGrpOperatorFn = generateConfigGrpObjOperatorFn(destinationRecord);

  const determineIfFileShouldBeIgnored = configGrpOperatorFn(
    determineFileIgnoreStatus
  );
  const computeFileDestinationPath = configGrpOperatorFn(
    determineFileDestinationPath
  );

  const newFileRecordPropWithIgnoreStatusAndDestPath = recordMap<File, File>(
    fileRecordPropEntry => ({
      ...fileRecordPropEntry,
      ignore: determineIfFileShouldBeIgnored(fileRecordPropEntry.name),

      destinationPath: pipe(
        fileRecordPropEntry.name,
        computeFileDestinationPath,
        trace(),
        (absPathToDestinationDir: string) =>
          path.resolve(absPathToDestinationDir, fileRecordPropEntry.name)
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
    : elem(S.Eq)(fileName)(namesOfFilesToIgnore);
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
  return pipe(fileRecord, toArray, map(getOnlyValueFromEntriesArr));
}

export function generateConfigGrpNamePathWithShellVars(configGrpName: string) {
  return pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RA.map(shellVar => `${shellVar}/${configGrpName}`)
  ) as readonly [string, string];
}

export function exitCli(
  msg: string,
  exitCode: ExitCodes = ExitCodes.OK
): IO.IO<never> {
  return () => {
    console.log(msg);
    process.exit(exitCode);
  };
}

export function exitCliWithCodeOnly(
  exitCode: ExitCodes = ExitCodes.OK
): IO.IO<never> {
  return () => {
    process.exit(exitCode);
  };
}

export const linkOperationTypeToPastTens: Record<LinkCmdOperationType, string> = {
  copy: 'copied',
  hardlink: 'hardlinked',
  symlink: 'symlinked',
};

export async function optionallyGetAllConfigGrpNamesInExistence() {
  const shouldProceedWithGettingAllConfigGrpNames = () =>
    prompts(
      {
        type: 'confirm',
        name: 'answer',
        message: 'Do you wish to operate on all config groups?',
        initial: false,
      },
      { onCancel: () => false }
    );

  // eslint-disable-next-line no-return-await
  return await pipe(
    shouldProceedWithGettingAllConfigGrpNames,
    T.map(({ answer }: { answer: boolean }) =>
      match(answer)
        .with(false, () => ExitCodes.OK as const)
        .with(true, getAllConfigGrpNames)
        .exhaustive()
    )
  )();
}

async function getAllConfigGrpNames() {
  const byLength = pipe(
    N.Ord,
    contramap((arr: string[]) => arr.length)
  );

  const allPossibleConfigGrpNames = await pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RA.wilt(T.ApplicativePar)(
      compose(getAllDirNamesAtFolderPath, expandShellVariablesInString)
    )
  )();

  const { right: allConfigGrpNamesOption } = pipe(
    allPossibleConfigGrpNames,
    Sep.map(flow(RA.sortBy([byLength]), RA.head))
  );

  return allConfigGrpNamesOption;
}
