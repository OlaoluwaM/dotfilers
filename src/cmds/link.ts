import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import parseCliArgs from '@lib/minimal-argp';

import { pipe } from 'fp-ts/lib/function';
import { chalk } from 'zx';
import { match, P } from 'ts-pattern';
import { copyFile } from 'fs/promises';
import { ExitCodes } from '../constants';
import { newAggregateError } from '../utils/AggregateError';
import {
  isNotIgnored,
  getFilesFromConfigGrp,
  default as createConfigGrps,
} from '@app/configGrpOps';
import {
  symlinkWithDeleteFirst,
  hardlinkWithDeleteFirst,
  createEntityPathIfItDoesNotExist,
} from '../utils/index';
import {
  File,
  CmdResponse,
  ConfigGroups,
  LinkCmdOperationType,
} from '../types/index';
import {
  exitCli,
  exitCliWithCodeOnly,
  linkOperationTypeToPastTense,
  optionallyGetAllConfigGrpNamesInExistence,
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

export default async function main(
  passedArguments: string[],
  cliOptions: string[] = []
) {
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

async function linkCmd(
  configGrpNames: string[],
  cliOptions: string[] = []
): Promise<CmdResponse<ConfigGroups>> {
  const chosenLinkCmdOperationFn = pipe(
    cliOptions,
    parseCmdOptions,
    performChosenLinkCmdOperation
  );

  const configGrpsWithErrors = await createConfigGrps(configGrpNames)();
  const { left: configGrpCreationErrs, right: configGrps } = configGrpsWithErrors;

  const operationFeedback = await chosenLinkCmdOperationFn(configGrps)();
  const { left: operationErrors, right: operationOutput } = operationFeedback;

  return {
    errors: [...configGrpCreationErrs, ...operationErrors],
    output: operationOutput,
    forTest: configGrps,
  };
}

function parseCmdOptions(rawCmdOptions: string[]) {
  const { options: parsedLinkCmdOptions } = pipe(
    rawCmdOptions,
    parseCliArgs(linkCmdCliOptionsConfig)
  );

  return determineLinkCmdOperationToPerform(parsedLinkCmdOptions);
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

function performChosenLinkCmdOperation(
  linkCmdOperationToPerform: LinkCmdOperationType
) {
  return (configGrpObjs: ConfigGroups) => {
    const linkCmdOperationFn = createChosenLinkOperationFn(
      linkCmdOperationToPerform
    );

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

function createChosenLinkOperationFn(linkOperationType: LinkCmdOperationType) {
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
                  hardlinkWithDeleteFirst(pathToSourceEntity, destinationPath)
                )
                .with('symlink', () =>
                  symlinkWithDeleteFirst(pathToSourceEntity, destinationPath)
                )
                .exhaustive()
          )
        )();

        const fileName = path.basename(pathToSourceEntity);
        return `${linkOperationTypeToPastTense[linkOperationType]} ${fileName} → ${destinationPath}`;
      },

      reason => {
        const errorMsg = `Could not create ${linkOperationType} for ${pathToSourceEntity} to ${destinationPath}. ${
          (reason as Error).message
        }`;

        return newAggregateError(errorMsg);
      }
    );
}
