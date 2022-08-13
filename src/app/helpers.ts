import { pipe } from 'fp-ts/lib/function';
import { Reader } from 'fp-ts/Reader';
import { homedir } from 'os';
import { compose, replace } from 'ramda';
import { elem, map, reduce } from 'fp-ts/lib/Array';
import { Eq, includes, slice } from 'fp-ts/lib/string';
import { deleteAt, map as recordMap, toArray } from 'fp-ts/lib/Record';
import { fromNullable, Option, getOrElse } from 'fp-ts/lib/Option';
import { ConfigGroup, DestinationRecord, File, FileRecord, Files, RawFile } from '@types';
import {
  newError,
  readJson,
  getAllFilesFromDirectory,
  getOnlyValueFromEntriesArr,
} from '@utils';
import {
  NOT_FOUND,
  EXCLUDE_KEY,
  ALL_FILES_CHAR,
  CURLY_BRACKET_REGEX,
  SHELL_ENV_VAR_REGEX,
  CONFIG_GRP_DEST_MAP_FILE_NAME,
} from '../constants';

interface ShellVariableMap {
  [variableName: string]: string | undefined;
}

export function expandShellVariablesInString(strWithShellVars: string) {
  return expandTokensInString(process.env)(strWithShellVars);
}

export function expandTokensInString(shellVariableValueMap: ShellVariableMap) {
  return replace(SHELL_ENV_VAR_REGEX, (substringMatch: string) =>
    pipe(
      shellVariableValueMap,
      resolveShellVariable(substringMatch),
      getOrElse(() => NOT_FOUND)
    )
  );
}

function resolveShellVariable(stringifiedShellVar: string) {
  return compose(
    resolveShellVariablesToTheirValues,
    resolveTildeAliasIfNeeded
  )(stringifiedShellVar);
}

function resolveTildeAliasIfNeeded(possibleTildeAlias: string) {
  if (possibleTildeAlias === '~') return '$HOME';
  return possibleTildeAlias;
}

function resolveShellVariablesToTheirValues(strWithShellVars: string) {
  return pipe(
    strWithShellVars,
    slice(1, Infinity),
    replace(CURLY_BRACKET_REGEX, ''),
    matchPotentialShellVariablesWithPaths
  );
}

function matchPotentialShellVariablesWithPaths(
  potentialShellVariable: string
): Reader<ShellVariableMap, Option<string>> {
  return shellVariableValueMap =>
    fromNullable(shellVariableValueMap[potentialShellVariable]);
}

export const isValidShellExpansion = includes(NOT_FOUND);

export async function parseConfigGrpPath(configGrpPath: string): Promise<ConfigGroup> {
  try {
    const rawFilesFromConfigGrpPath = await getAllFilesFromDirectory(configGrpPath);
    const normalizedFilesFromConfigGrpPathDir = pipe(
      rawFilesFromConfigGrpPath,
      map(fromRawFileToFile)
    );

    return {
      files: normalizedFilesFromConfigGrpPathDir,

      fileRecord: pipe(
        normalizedFilesFromConfigGrpPathDir,
        reduce({} as FileRecord, fromFileArrToFileRecord)
      ),

      destinationRecord: await readJson(
        `${configGrpPath}/${CONFIG_GRP_DEST_MAP_FILE_NAME}`
      ),
    };
  } catch (e) {
    throw newError(
      `An error occurred while attempting to read directory at path ${configGrpPath}`
    );
  }
}

function fromRawFileToFile(curr: RawFile) {
  const updatedFileObj = deleteAt('dirent')({ ...curr }) as File;
  return updatedFileObj;
}

function fromFileArrToFileRecord(initialFileRecord: FileRecord, currentFile: File) {
  initialFileRecord[currentFile.name] = currentFile;
  return initialFileRecord;
}

export function updateConfigGrpFilesWithNecessaryMetaData(
  configGrp: ConfigGroup
): ConfigGroup {
  const { fileRecord, destinationRecord } = configGrp;

  const shouldFileBeIgnored = bar(determineFileIgnoreStatus)(destinationRecord);
  const computeFileDestinationPath = bar(determineFileDestinationPath)(destinationRecord);

  const newFileRecordWithIgnoreStatus = recordMap<File, File>(fileRecordEntry => ({
    ...fileRecordEntry,
    ignore: shouldFileBeIgnored(fileRecordEntry.name),
    destinationPath: pipe(
      fileRecordEntry.name,
      computeFileDestinationPath,
      expandShellVariablesInString
    ),
  }))(fileRecord) as ConfigGroup['fileRecord'];

  return {
    ...configGrp,
    files: generateFilesArrFromFileRecord(newFileRecordWithIgnoreStatus),
    fileRecord: newFileRecordWithIgnoreStatus,
  };
}

// TODO: Improve function name
function bar<RT>(fn: (destinationRecord: DestinationRecord, fileName: string) => RT) {
  return (destinationRecord: DestinationRecord) => (fileName: string) =>
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
    : elem(Eq)(fileName)(namesOfFilesToIgnore);
}

function determineFileDestinationPath(
  destinationRecord: DestinationRecord,
  fileName: string
): string {
  return destinationRecord[fileName] ?? destinationRecord[ALL_FILES_CHAR] ?? homedir();
}

function generateFilesArrFromFileRecord(fileRecord: FileRecord): Files {
  return pipe(fileRecord, toArray, map(getOnlyValueFromEntriesArr));
}
