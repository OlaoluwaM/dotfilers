import * as N from 'fp-ts/lib/number';
import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as TE from 'fp-ts/lib/TaskEither';
import * as Sep from 'fp-ts/lib/Separated';
import * as RNEA from 'fp-ts/lib/ReadonlyNonEmptyArray';

import path from 'path';
import prompts from 'prompts';
import parseCliArgs from '@lib/minimal-argp';

import { not } from 'fp-ts/lib/Predicate';
import { chalk } from 'zx';
import { match, P } from 'ts-pattern';
import { copyFile } from 'fs/promises';
import { flow, pipe } from 'fp-ts/lib/function';
import { contramap } from 'fp-ts/lib/Ord';
import { compose, lensProp, view } from 'ramda';
import {
  addError,
  AggregateError,
  newAggregateError,
} from '../utils/AggregateError';
import {
  ExitCodes,
  SHELL_VARS_TO_CONFIG_GRP_DIRS,
  SHELL_VARS_TO_CONFIG_GRP_DIRS_STR,
} from '../constants';
import {
  ConfigGroup,
  ConfigGroups,
  LinkCmdOperationType,
  File,
} from '../types/index';
import {
  logOutput,
  logErrors,
  doesPathExist,
  symlinkWithOverride,
  hardlinkWithOverride,
  getAllDirNamesAtFolderPath,
  createEntityPathIfItDoesNotExist,
} from '../utils/index';
import {
  exitCli,
  exitCliWithCodeOnly,
  isValidShellExpansion,
  expandShellVariablesInString,
  createConfigGrpFromConfigGrpPath,
  generateConfigGrpNamePathWithShellVars,
  updateConfigGrpObjWithNecessaryMetaData,
  linkOperationTypeToPastTens,
} from '@app/helpers';

const linkCmdCliOptionsConfig = {
  options: {
    hardlink: {
      type: Boolean,
      alias: 'H',
    },
    copy: {
      type: Boolean,
      alias: 'c',
    },
  },
} as const;

export default async function main(passedArguments: string[], cliOptions: string[]) {
  const configGrpNames = A.isEmpty(passedArguments)
    ? await optionallyGetAllConfigGrpNamesInExistence()
    : passedArguments;

  const fatalErrMsg = chalk.red.bold(
    'Could not find where you keep your configuration groups. Are you sure you have correctly set the required env variables? If so, then perhaps you have no configuration groups yet.'
  );

  // eslint-disable-next-line no-return-await
  const cmdOutput = await match(configGrpNames)
    .with(ExitCodes.OK as 0, exitCliWithCodeOnly)
    .with({ _tag: 'None' }, () => exitCli(fatalErrMsg, ExitCodes.GENERAL))
    .with({ _tag: 'Some' }, (_, some) => linkCmd(some.value, cliOptions))
    .with(P.array(P.string), (_, value) => linkCmd(value, cliOptions))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
}

async function optionallyGetAllConfigGrpNamesInExistence() {
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

async function linkCmd(configGrpNames: string[], cliOptions: string[]) {
  const chosenLinkCmdOperationFn = pipe(
    cliOptions,
    parseCmdOptions,
    createChosenLinkCmdOperationFn
  );

  const configGrpsWithErrors = await createConfigGrpObjs(configGrpNames)();
  const { left: configGrpCreationErrs, right: configGrps } = configGrpsWithErrors;

  const operationFeedback = await chosenLinkCmdOperationFn(configGrps)();
  const { left: operationErrors, right: operationOutput } = operationFeedback;

  pipe(
    logOutput(operationOutput)(),
    logErrors(configGrpCreationErrs.concat(operationErrors))
  );

  // NOTE: This return is for testing purposes only
  return configGrps;
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

function parseCmdOptions(rawCmdOptions: string[]) {
  const { options: parsedLinkCmdOptions } = pipe(
    rawCmdOptions,
    parseCliArgs(linkCmdCliOptionsConfig)
  );

  return determineLinkCmdOperationToPerform(parsedLinkCmdOptions);
}

function createConfigGrpObjs(configGrpNames: string[]) {
  return pipe(
    configGrpNames,
    A.wilt(T.ApplicativePar)(transformConfigGrpNameIntoConfigGrpObj)
  );
}

function transformConfigGrpNameIntoConfigGrpObj(configGrpName: string) {
  return pipe(
    configGrpName,
    generateAbsolutePathToConfigGrpDir,
    TE.fromOption(() => newAggregateError('')),
    TE.chain(doesPathExist),
    TE.mapLeft(handleConfigGrpDirPathValidityErr(configGrpName)),
    TE.chain(createConfigGrpFromConfigGrpPath),
    TE.map(updateConfigGrpObjWithNecessaryMetaData)
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

interface ParsedLinkCmdOptions {
  readonly hardlink: boolean;
  readonly copy: boolean;
}
function determineLinkCmdOperationToPerform(
  parsedLinkCmdOptions: ParsedLinkCmdOptions
) {
  type ValidLinkCmdOptionConfiguration =
    | [true, false]
    | [false, true]
    | [false, false];

  const { hardlink, copy } = parsedLinkCmdOptions;
  const linkCmdOperationConfiguration = [
    hardlink,
    copy,
  ] as ValidLinkCmdOptionConfiguration;

  return match(linkCmdOperationConfiguration)
    .with([true, false], () => 'hardlink')
    .with([false, true], () => 'copy')
    .with([false, false], () => 'symlink')
    .otherwise(() => 'symlink') as LinkCmdOperationType;
}

function createChosenLinkCmdOperationFn(
  linkCmdOperationToPerform: LinkCmdOperationType
) {
  return (configGrpObjs: ConfigGroups) => {
    const linkCmdOperationFn = createLinkOperationFn(linkCmdOperationToPerform);

    return pipe(
      configGrpObjs,
      A.map(getFilesFromConfigGrp),
      A.flatten,
      A.filter<File>(isNotIgnored),

      A.wilt(T.ApplicativePar)(({ path: sourcePath, destinationPath }) =>
        linkCmdOperationFn(sourcePath, destinationPath)
      )
    );
  };
}

function createLinkOperationFn(linkOperationType: LinkCmdOperationType) {
  return (pathToSourceEntity: string, destinationPath: string) =>
    TE.tryCatch(
      async () => {
        await pipe(
          createEntityPathIfItDoesNotExist(path.dirname(destinationPath)),
          T.chain(
            () => () =>
              match(linkOperationType)
                .with('copy', () => copyFile(pathToSourceEntity, destinationPath))

                .with('hardlink', () =>
                  hardlinkWithOverride(pathToSourceEntity, destinationPath)
                )

                .with('symlink', () =>
                  symlinkWithOverride(pathToSourceEntity, destinationPath)
                )
                .exhaustive()
          )
        )();

        const fileName = path.basename(pathToSourceEntity);
        return `${linkOperationTypeToPastTens[linkOperationType]} ${fileName} → ${destinationPath}`;
      },

      reason => {
        const errorMsg = `Could not create ${linkOperationType} for ${pathToSourceEntity} to ${destinationPath}. ${
          (reason as Error).message
        }`;

        return newAggregateError(errorMsg);
      }
    );
}

function getFilesFromConfigGrp(configGrpObj: ConfigGroup) {
  const filesLens = lensProp<ConfigGroup, 'files'>('files');
  return view(filesLens, configGrpObj);
}

function isNotIgnored(fileObj: File): boolean {
  return fileObj.ignore === false;
}
