import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import parseCliArgs from '@lib/minimal-argp/index';

import { pipe } from 'fp-ts/lib/function';
import { match, P } from 'ts-pattern';
import { ExitCodes } from '../constants';
import { newAggregateError } from '@utils/AggregateError';
import {
  isNotIgnored,
  getFilesFromConfigGroup,
  default as createConfigGroups,
} from '@app/configGroup';
import {
  normalizedCopy,
  deleteThenSymlink,
  deleteThenHardlink,
  createDirIfItDoesNotExist,
} from '@utils/index';
import {
  exitCli,
  exitCliWithCodeOnly,
  linkOperationTypeToPastTense,
  getPathsToAllConfigGroupDirsInExistence,
} from '@app/helpers';
import {
  File,
  SourcePath,
  CmdResponse,
  ConfigGroup,
  DestinationPath,
  LinkCmdOperationType,
} from '@types';

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
  const configGroupNamesOrDirPaths = A.isEmpty(passedArguments)
    ? await getPathsToAllConfigGroupDirsInExistence()
    : passedArguments;

  const cmdOutput = await match(configGroupNamesOrDirPaths)
    .with(ExitCodes.OK as 0, exitCliWithCodeOnly)
    .with({ _tag: 'Left' }, (_, { left }) =>
      exitCli(left.message, ExitCodes.GENERAL)
    )
    .with({ _tag: 'Right' }, (_, { right }) => linkCmd(right, cliOptions))
    .with(P.array(P.string), (_, value) => linkCmd(value, cliOptions))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
}

async function linkCmd(
  configGroupNamesOrDirPaths: string[],
  cliOptions: string[] = []
): Promise<CmdResponse<ConfigGroup[]>> {
  const chosenLinkCmdOperationFn = pipe(
    cliOptions,
    parseCmdOptions,
    performChosenLinkCmdOperation
  );

  const configGroupsWithErrors = await createConfigGroups(
    configGroupNamesOrDirPaths
  )();
  const { left: configGroupCreationErrs, right: configGroups } =
    configGroupsWithErrors;

  const operationFeedback = await chosenLinkCmdOperationFn(configGroups)();
  const { left: operationErrors, right: operationOutput } = operationFeedback;

  return {
    errors: [...configGroupCreationErrs, ...operationErrors],
    output: operationOutput,
    forTest: configGroups,
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
  return (configGroups: ConfigGroup[]) => {
    const linkCmdOperationFn = createChosenLinkOperationFn(
      linkCmdOperationToPerform
    );

    return pipe(
      configGroups,
      A.chain(getFilesFromConfigGroup),
      A.filter<File>(isNotIgnored),

      A.wilt(T.ApplicativePar)(({ sourcePath, destinationPath }) =>
        linkCmdOperationFn(sourcePath, destinationPath)
      )
    );
  };
}

function createChosenLinkOperationFn(linkOperationType: LinkCmdOperationType) {
  return (pathToSourceEntity: SourcePath, destinationPath: DestinationPath) =>
    TE.tryCatch(
      async () => {
        await pipe(
          createDirIfItDoesNotExist(path.dirname(destinationPath)),

          T.chain(
            () => () =>
              match(linkOperationType)
                .with('copy', () =>
                  normalizedCopy(pathToSourceEntity, destinationPath)
                )
                .with('hardlink', () =>
                  deleteThenHardlink(pathToSourceEntity, destinationPath)
                )
                .with('symlink', () =>
                  deleteThenSymlink(pathToSourceEntity, destinationPath)
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
