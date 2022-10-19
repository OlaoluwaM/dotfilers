import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/Lens';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RC from 'fp-ts/lib/Record';

import path from 'path';

import { pipe } from 'fp-ts/lib/function';
import { match, P } from 'ts-pattern';
import { ExitCodes } from '../constants';
import { newAggregateError } from '@utils/AggregateError';
import {
  ParserOutput,
  default as parseArgv,
  optionConfigConstructor,
} from '@lib/arg-parser';
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

interface ParsedCmdOptions {
  readonly hardlink: boolean;
  readonly copy: boolean;
  readonly yes: boolean;
}

export default async function main(
  passedArguments: string[],
  cliOptions: string[] = []
) {
  const parsedCmdOptions: ParsedCmdOptions = parseCmdOptions(cliOptions);

  const configGroupNamesOrDirPaths = A.isEmpty(passedArguments)
    ? await getPathsToAllConfigGroupDirsInExistence(parsedCmdOptions.yes)
    : passedArguments;

  const cmdOutput = await match(configGroupNamesOrDirPaths)
    .with(ExitCodes.OK as 0, exitCliWithCodeOnly)
    .with({ _tag: 'Left' }, (_, { left }) =>
      exitCli(left.message, ExitCodes.GENERAL)
    )
    .with({ _tag: 'Right' }, (_, { right }) => linkCmd(right, parsedCmdOptions))
    .with(P.array(P.string), (_, value) => linkCmd(value, parsedCmdOptions))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
}

function parseCmdOptions(rawCmdOptions: string[]): ParsedCmdOptions {
  const linkCmdOptionsConfig = generateOptionConfig();

  const OptionsLens = pipe(
    L.id<ParserOutput<typeof linkCmdOptionsConfig>>(),
    L.prop('options')
  );

  return pipe(
    rawCmdOptions,
    parseArgv(linkCmdOptionsConfig),
    OptionsLens.get,
    RC.map(O.getOrElse(() => false))
  );
}

function generateOptionConfig() {
  return {
    options: {
      hardlink: optionConfigConstructor({
        parser: () => true,
        isFlag: true,
        aliases: ['H'],
      }),

      copy: optionConfigConstructor({
        parser: () => true,
        isFlag: true,
        aliases: ['c'],
      }),

      yes: optionConfigConstructor({
        parser: () => true,
        isFlag: true,
        aliases: ['y'],
      }),
    },
  };
}

async function linkCmd(
  configGroupNamesOrDirPaths: string[],
  cliOptions: ParsedCmdOptions
): Promise<CmdResponse<ConfigGroup[]>> {
  const chosenLinkCmdOperationFn = pipe(
    cliOptions,
    determineLinkCmdOperationToPerform,
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

function determineLinkCmdOperationToPerform(
  parsedLinkCmdOptions: ParsedCmdOptions
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
