import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/lib/Lens';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RNEA from 'fp-ts/lib/ReadonlyNonEmptyArray';

import path from 'path';
import chalk from 'chalk';
import fsExtra from 'fs-extra';
import prompts from 'prompts';

import { not } from 'fp-ts/lib/Predicate';
import { omit } from 'ramda';
import { constant, constFalse, flow, pipe } from 'fp-ts/lib/function';
import { default as readdirp, ReaddirpOptions } from 'readdirp';
import { removeCommonPathSegment, removeLeadingPathSeparator } from '@utils/index';
import {
  isValidShellExpansion,
  expandShellVariablesInString,
} from '@lib/shellVarStrExpander';
import {
  ParserConfig,
  AnyParserOutput,
  default as parseArgv,
} from '@lib/arg-parser/';
import {
  ExitCodes,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
} from '../constants';
import {
  RawFile,
  CmdOptions,
  CmdResponse,
  PartialFile,
  toSourcePath,
  LinkCmdOperationType,
  CmdResponseWithTestOutput,
} from '@types';

export function getAllOperableFilesFromConfigGroupDir(
  rootPath: string
): T.Task<PartialFile[]> {
  return async () => {
    const partialFiles = [] as PartialFile[];

    const fsTraversalConfig: Partial<ReaddirpOptions> = {
      fileFilter: [`!${CONFIG_GRP_DEST_RECORD_FILE_NAME}`],
      directoryFilter: flow(dirInfo => dirInfo.fullPath, not(isConfigGroupDir)),
    };

    // eslint-disable-next-line no-restricted-syntax
    for await (const fileEntryInfo of readdirp(rootPath, fsTraversalConfig)) {
      const partialFileObj = toValidFileObj(fileEntryInfo as RawFile);
      partialFiles.push(partialFileObj);
    }

    return partialFiles;
  };
}

function isConfigGroupDir(dirPath: string) {
  return fsExtra.pathExistsSync(
    path.join(dirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME)
  );
}

function toValidFileObj(rawFileObj: RawFile) {
  const validFileObj: PartialFile = {
    sourcePath: toSourcePath(rawFileObj.fullPath),
    name: rawFileObj.path,
    basename: rawFileObj.basename,
  };

  return validFileObj;
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

export const linkOperationTypeToPastTense: Record<LinkCmdOperationType, string> = {
  copy: 'copied',
  hardlink: 'hardlinked',
  symlink: 'symlinked',
};

export function getPathToDotfilesDirPath() {
  return pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RNEA.map(expandShellVariablesInString),
    RA.filter(not(isValidShellExpansion)),
    RA.head
  );
}

export function getPathsToAllConfigGroupDirsInExistence(overridePrompt: boolean) {
  return pipe(
    promptForConfirmation(overridePrompt),
    TE.fromTask,
    TE.filterOrElse(
      ({ answer }: { answer: boolean }) => answer,
      () => ExitCodes.OK as const
    ),
    TE.chainW(getAllConfigGroupDirPaths)
  );
}

function promptForConfirmation(overridePrompt: boolean) {
  return async () => {
    // For a prettier output
    console.log('\n');

    // We specify `undefined` here because we want to manually clear our overrides
    // On every pass to this function if we do not want the prompt to be overridden
    prompts.override({ answer: overridePrompt || undefined });
    return await prompts(
      {
        type: 'confirm',
        name: 'answer',
        message: 'Do you wish to operate on all config groups?',
        initial: false,
      },
      { onCancel: constFalse }
    );
  };
}

export function getPathsToAllConfigGroupDirsInExistenceInteractively() {
  return flow(
    getAllConfigGroupDirPaths,
    TE.bindTo('allConfigGroupDirPaths'),

    TE.let('configGroupDirPathsWithoutCommonPrefix', ({ allConfigGroupDirPaths }) =>
      pipe(
        allConfigGroupDirPaths,
        removeCommonPathSegment,
        A.map(removeLeadingPathSeparator)
      )
    ),

    TE.chainW(flow(toInteractivePromptChoices, TE.right)),
    TE.chainTaskK(promptForConfigGroupMultiSelection),
    TE.map(({ value: selectedDirPaths }) => selectedDirPaths),
    TE.filterOrElseW(A.isNonEmpty, () => ExitCodes.OK as const)
  );
}

interface ConfigGroupChoice {
  title: string;
  value: string;
}

function toInteractivePromptChoices({
  allConfigGroupDirPaths,
  configGroupDirPathsWithoutCommonPrefix,
}: {
  allConfigGroupDirPaths: string[];
  configGroupDirPathsWithoutCommonPrefix: string[];
}): ConfigGroupChoice[] {
  return pipe(
    allConfigGroupDirPaths,
    A.mapWithIndex((ind, configGroupDirPath) => ({
      title: configGroupDirPathsWithoutCommonPrefix[ind],
      value: configGroupDirPath,
    }))
  );
}

function promptForConfigGroupMultiSelection(
  configGroupChoices: ConfigGroupChoice[]
) {
  return async () => {
    // For a prettier output
    console.log('\n');

    return (await prompts(
      {
        type: 'autocompleteMultiselect',
        name: 'value',
        message: 'Pick the config groups to work on',
        choices: configGroupChoices,
        hint: '- Space to select. Return to submit',
      },
      { onCancel: constant([]) }
    )) as { value: string[] };
  };
}

export function getAllConfigGroupDirPaths(): TE.TaskEither<Error, string[]> {
  return TE.tryCatch(async () => {
    const configGroupPaths = [] as string[];

    const dotfilesDirPath = getPathToDotfilesDirPath();
    if (O.isNone(dotfilesDirPath)) {
      throw new Error('Could not find dotfiles directory');
    }

    const fsTraversalConfig: Partial<ReaddirpOptions> = {
      root: dotfilesDirPath.value,
      directoryFilter: flow(dirInfo => dirInfo.fullPath, isConfigGroupDir),
      type: 'directories',
    };

    // eslint-disable-next-line no-restricted-syntax
    for await (const dirInfo of readdirp(dotfilesDirPath.value, fsTraversalConfig)) {
      configGroupPaths.push(dirInfo.fullPath);
    }

    return configGroupPaths;
  }, getPathToDotfilesDirPathRetrievalError());
}

export function getPathToDotfilesDirPathRetrievalError() {
  return () =>
    new Error(
      chalk.bold.red(
        `Could not find where you keep your configuration groups. Are you sure you have correctly set the required env variables (${SHELL_VARS_TO_CONFIG_GRP_DIRS})? If so, then perhaps you have no configuration groups yet.`
      )
    );
}

export function parseCmdOptions<PC extends ParserConfig>(parserConfig: PC) {
  return (cmdOptions: string[]) => pipe(cmdOptions, parseArgv(parserConfig));
}

export function getOptionsFromParserOutput<PO extends AnyParserOutput>(
  parserOutput: PO
) {
  return pipe(L.id<PO>(), L.prop('options')).get(parserOutput);
}

export function getParsedOptions<PC extends ParserConfig>(parserConfig: PC) {
  return (cmdOptions: CmdOptions) =>
    pipe(parseArgv(parserConfig)(cmdOptions), getOptionsFromParserOutput);
}

export function removeTestOutputFromCommandResponse<T>(
  cmdResponse: CmdResponseWithTestOutput<T>
) {
  return omit(['testOutput'], cmdResponse) as CmdResponse;
}
