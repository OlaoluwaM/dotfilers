import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as RC from 'fp-ts/lib/Record';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';

import { match, P } from 'ts-pattern';
import { newAggregateError } from '@utils/AggregateError';
import { ExitCodes, spinner } from '../constants';
import { constTrue, flow, pipe } from 'fp-ts/lib/function';
import { optionConfigConstructor } from '@lib/arg-parser';
import {
  isNotIgnored,
  getFilesFromConfigGroup,
  default as createConfigGroups,
} from '@app/configGroup';
import {
  bind,
  arrayToList,
  normalizedCopy,
  deleteThenSymlink,
  deleteThenHardlink,
  createDirIfItDoesNotExist,
  indentText,
} from '@utils/index';
import {
  exitCli,
  getParsedOptions,
  exitCliWithCodeOnly,
  linkOperationTypeToPastTense,
  getPathsToAllConfigGroupDirsInExistence,
  getPathsToAllConfigGroupDirsInExistenceInteractively,
} from '@app/helpers';
import {
  File,
  SourcePath,
  CmdOptions,
  ConfigGroup,
  PositionalArgs,
  DestinationPath,
  CurriedReturnType,
  CmdFnWithTestOutput,
  LinkCmdOperationType,
  CmdResponseWithTestOutput,
} from '@types';

interface ParsedCmdOptions {
  readonly hardlink: boolean;
  readonly copy: boolean;
  readonly yes: boolean;
  readonly interactive: boolean;
}

// TODO: Find Better Name for this interface and corresponding parameters
interface LinkCmdParameter {
  readonly parsedLinkCmdOptions: ParsedCmdOptions;
  readonly configGroupNamesOrDirPaths: string[];
}

export default function main(
  cmdArguments: PositionalArgs,
  cmdOptions: CmdOptions
): ReturnType<CmdFnWithTestOutput<ConfigGroup[]>> {
  return pipe(
    TE.Do,
    TE.let('parsedLinkCmdOptions', () => parseCmdOptions(cmdOptions)),

    TE.bind('configGroupNamesOrDirPaths', ({ parsedLinkCmdOptions }) =>
      A.isEmpty(cmdArguments)
        ? promptForConfigGroupsBasedOnCmdOptions(parsedLinkCmdOptions)
        : TE.right(cmdArguments)
    ),

    TE.mapLeft(aggregateCmdErrors),

    TE.chainFirstIOK(({ configGroupNamesOrDirPaths }) =>
      initiateSpinner(configGroupNamesOrDirPaths)
    ),

    TE.chainW(flow(linkCmd, TE.rightTask)),

    TE.chainFirstIOK(() => stopSpinnerOnSuccess),
    TE.mapLeft(flow(IO.chainFirst(() => stopSpinnerOnError)))
  );
}

function parseCmdOptions(cmdOptions: CmdOptions): ParsedCmdOptions {
  return pipe(
    cmdOptions,
    pipe(generateOptionConfig(), getParsedOptions),
    RC.map(O.getOrElse(() => false))
  );
}

function generateOptionConfig() {
  return {
    options: {
      hardlink: optionConfigConstructor({
        parser: constTrue,
        isFlag: true,
        aliases: ['H'],
      }),

      copy: optionConfigConstructor({
        parser: constTrue,
        isFlag: true,
        aliases: ['c'],
      }),

      yes: optionConfigConstructor({
        parser: constTrue,
        isFlag: true,
        aliases: ['y'],
      }),

      interactive: optionConfigConstructor({
        parser: constTrue,
        isFlag: true,
        aliases: ['i'],
      }),
    },
  };
}

function promptForConfigGroupsBasedOnCmdOptions(cmdOptions: ParsedCmdOptions) {
  const { yes, interactive } = cmdOptions;
  const relevantOptionCombinations: [boolean, boolean] = [yes, interactive];

  return match(relevantOptionCombinations)
    .with(P.union([true, false], [false, false]), () =>
      getPathsToAllConfigGroupDirsInExistence(yes)
    )
    .with(
      P.union([true, true], [false, true]),
      getPathsToAllConfigGroupDirsInExistenceInteractively()
    )
    .exhaustive();
}

function aggregateCmdErrors(errors: ExitCodes.OK | Error) {
  return match(errors)
    .with(ExitCodes.OK as 0, exitCliWithCodeOnly)
    .with(P.instanceOf(Error), (_, err) => exitCli(err.message, ExitCodes.GENERAL))
    .exhaustive();
}

function initiateSpinner(configGroupNamesOrDirPaths: string[]) {
  const configGroupsNames = pipe(configGroupNamesOrDirPaths, A.map(path.basename));

  return () => {
    // For a prettier output
    console.log('\n');

    return pipe(
      `Linking files from the following config groups: ${arrayToList(
        configGroupsNames
      )}...`,
      indentText(),
      spinner.start.bind(spinner)
    );
  };
}

interface LinkOperationResponse {
  readonly configGroupCreationResults: Awaited<
    CurriedReturnType<typeof createConfigGroups>
  >;

  readonly linkOperationResults: Awaited<
    CurriedReturnType<typeof performChosenLinkCmdOperation>
  >;
}

function linkCmd({
  parsedLinkCmdOptions,
  configGroupNamesOrDirPaths,
}: LinkCmdParameter) {
  const chosenLinkCmdOperationFn = pipe(
    parsedLinkCmdOptions,
    determineLinkCmdOperationToPerform,
    performChosenLinkCmdOperation
  );

  return pipe(
    T.Do,
    T.bind(
      'configGroupCreationResults',
      bind(createConfigGroups)(configGroupNamesOrDirPaths)
    ),

    T.bind(
      'linkOperationResults',
      ({ configGroupCreationResults: { right: configGroups } }) =>
        chosenLinkCmdOperationFn(configGroups)
    ),

    T.map(generateCmdResponse)
  );
}

function generateCmdResponse(
  linkOperationResponse: LinkOperationResponse
): CmdResponseWithTestOutput<ConfigGroup[]> {
  const { configGroupCreationResults, linkOperationResults } = linkOperationResponse;

  const { left: configGroupCreationErrs, right: configGroups } =
    configGroupCreationResults;

  const { left: operationErrors, right: operationOutput } = linkOperationResults;

  return {
    errors: [...configGroupCreationErrs, ...operationErrors],
    output: operationOutput,
    testOutput: configGroups,
    warnings: [],
  };
}

function determineLinkCmdOperationToPerform(parsedLinkCmdOptions: ParsedCmdOptions) {
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
  const performLinkOperation = matchDesiredLinkOperation(linkOperationType);

  return (pathToSourceEntity: SourcePath, destinationPath: DestinationPath) =>
    TE.tryCatch(
      async () => {
        await pipe(
          path.dirname(destinationPath),
          createDirIfItDoesNotExist,
          T.chain(() => performLinkOperation(pathToSourceEntity, destinationPath))
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

function matchDesiredLinkOperation(linkOperationType: LinkCmdOperationType) {
  return (
      pathToSourceEntity: SourcePath,
      destinationPath: DestinationPath
    ): T.Task<void> =>
    () =>
      match(linkOperationType)
        .with('copy', () => normalizedCopy(pathToSourceEntity, destinationPath))
        .with('hardlink', () =>
          deleteThenHardlink(pathToSourceEntity, destinationPath)
        )
        .with('symlink', () =>
          deleteThenSymlink(pathToSourceEntity, destinationPath)
        )
        .exhaustive();
}

function stopSpinnerOnSuccess() {
  return pipe('Linking complete!', indentText(), spinner.succeed.bind(spinner));
}

function stopSpinnerOnError() {
  return pipe(
    'Linking failed. Exiting...',
    indentText(),
    spinner.fail.bind(spinner)
  );
}
