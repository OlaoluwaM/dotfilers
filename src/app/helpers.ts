import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as IO from 'fp-ts/lib/IO';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RNEA from 'fp-ts/lib/ReadonlyNonEmptyArray';

import path from 'path';
import prompts from 'prompts';

import { not } from 'fp-ts/lib/Predicate';
import { match } from 'ts-pattern';
import { flow, pipe } from 'fp-ts/lib/function';
import { fs as fsExtra, chalk } from 'zx';
import { default as readdirp, ReaddirpOptions } from 'readdirp';
import { RawFile, PartialFile, toSourcePath, LinkCmdOperationType } from '@types';
import {
  isValidShellExpansion,
  expandShellVariablesInString,
} from '@lib/shellVarStrExpander';
import {
  ExitCodes,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  CONFIG_GRP_DEST_RECORD_FILE_NAME,
} from '../constants';

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

export function getPathToDotfilesDir() {
  return pipe(
    SHELL_VARS_TO_CONFIG_GRP_DIRS,
    RNEA.map(expandShellVariablesInString),
    RA.filter(not(isValidShellExpansion)),
    RA.head
  );
}

export async function getPathsToAllConfigGroupDirsInExistence(): Promise<
  ExitCodes.OK | E.Either<Error, string[]>
> {
  const shouldProceedWithGettingAllConfigGroupNames = () =>
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
    shouldProceedWithGettingAllConfigGroupNames,
    T.map(({ answer }: { answer: boolean }) =>
      match(answer)
        .with(false, () => ExitCodes.OK as const)
        .with(true, getAllConfigGroupDirPaths())
        .exhaustive()
    )
  )();
}

export function getAllConfigGroupDirPaths(): TE.TaskEither<Error, string[]> {
  return TE.tryCatch(async () => {
    const configGroupPaths = [] as string[];

    const dotfilesDirPath = getPathToDotfilesDir();
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
  }, generateConfigGroupDirPathsRetrievalError());
}

function generateConfigGroupDirPathsRetrievalError() {
  return () =>
    new Error(
      chalk.bold.red(
        'Could not find where you keep your configuration groups. Are you sure you have correctly set the required env variables? If so, then perhaps you have no configuration groups yet.'
      )
    );
}
