import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/lib/Lens';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as RC from 'fp-ts/lib/Record';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';

import { match, P } from 'ts-pattern';
import { ExitCodes, spinner } from '../constants';
import { pipe, flow, constTrue } from 'fp-ts/lib/function';
import { optionConfigConstructor } from '@lib/arg-parser';
import { arrayToList, bind, indentText, removeEntityAt } from '@utils/index';
import {
  isNotIgnored,
  getFilesFromConfigGroup,
  default as createConfigGroups,
} from '@app/configGroup';
import {
  exitCli,
  getParsedOptions,
  exitCliWithCodeOnly,
  getPathsToAllConfigGroupDirsInExistence,
  getPathsToAllConfigGroupDirsInExistenceInteractively,
} from '@app/helpers';
import {
  File,
  CmdOptions,
  ConfigGroup,
  PositionalArgs,
  DestinationPath,
  CurriedReturnType,
  CmdFnWithTestOutput,
  CmdResponseWithTestOutput,
} from '@types';

interface ParsedCmdOptions {
  readonly yes: boolean;
  readonly interactive: boolean;
}

export default function main(
  cmdArguments: PositionalArgs,
  cmdOptions: CmdOptions
): ReturnType<CmdFnWithTestOutput<DestinationPath[]>> {
  return pipe(
    TE.of(cmdOptions),
    TE.map(parseUnlinkCmdOptions),

    TE.chain(parsedCmdOptions =>
      A.isEmpty(cmdArguments)
        ? promptForConfigGroupsBasedOnCmdOptions(parsedCmdOptions)
        : TE.right(cmdArguments)
    ),

    TE.mapLeft(aggregateCmdErrors),

    TE.chainFirstIOK(configGroupNamesOrDirPaths =>
      initiateSpinner(configGroupNamesOrDirPaths)
    ),

    TE.chainW(flow(unlinkCmd, TE.rightTask)),

    TE.chainFirstIOK(() => stopSpinnerOnSuccess),
    TE.mapLeft(flow(IO.chainFirst(() => stopSpinnerOnError)))
  );
}

function parseUnlinkCmdOptions(cmdOptions: CmdOptions): ParsedCmdOptions {
  return pipe(
    cmdOptions,
    pipe(generateOptionConfig(), getParsedOptions),
    RC.map(O.getOrElse(() => false))
  );
}

function generateOptionConfig() {
  return {
    options: {
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
      `Unlinking files from the following config groups: ${arrayToList(
        configGroupsNames
      )}...`,
      indentText(),
      spinner.start.bind(spinner)
    );
  };
}

interface UnlinkOperationResponse {
  readonly configGroupCreationResults: Awaited<
    CurriedReturnType<typeof createConfigGroups>
  >;

  readonly unlinkOperationResult: Awaited<
    CurriedReturnType<typeof undoOperationPerformedByLinkCmd>
  >;

  readonly validDestinationPaths: ReturnType<
    typeof getDestinationPathsForAllNonIgnoredFiles
  >;
}

function unlinkCmd(configGroupNamesOrDirPaths: string[]) {
  return pipe(
    T.Do,

    T.bind(
      'configGroupCreationResults',
      bind(createConfigGroups)(configGroupNamesOrDirPaths)
    ),

    T.let(
      'validDestinationPaths',
      ({ configGroupCreationResults: { right: configGroups } }) =>
        getDestinationPathsForAllNonIgnoredFiles(configGroups)
    ),

    T.bind('unlinkOperationResult', ({ validDestinationPaths }) =>
      undoOperationPerformedByLinkCmd(validDestinationPaths)
    ),

    T.map(generateCmdResponse)
  );
}

function generateCmdResponse(
  unlinkOperationResponse: UnlinkOperationResponse
): CmdResponseWithTestOutput<DestinationPath[]> {
  const {
    configGroupCreationResults,
    validDestinationPaths: validConfigGroupDestinationPaths,
    unlinkOperationResult,
  } = unlinkOperationResponse;

  const { left: configGroupCreationErrs } = configGroupCreationResults;
  const { left: deletionErrors, right: deletionOutput } = unlinkOperationResult;

  return {
    errors: [...deletionErrors, ...configGroupCreationErrs],
    output: deletionOutput,
    testOutput: validConfigGroupDestinationPaths,
    warnings: [],
  };
}

function getDestinationPathsForAllNonIgnoredFiles(configGroups: ConfigGroup[]) {
  return pipe(
    configGroups,
    A.chain(getFilesFromConfigGroup),
    A.filterMap(getDestinationPathForFileObjsThatAreNotIgnored)
  );
}

function getDestinationPathForFileObjsThatAreNotIgnored(configGroupFileObj: File) {
  return pipe(
    configGroupFileObj,
    O.fromPredicate(isNotIgnored),
    O.map(getDestinationPathForFileObj)
  );
}

function getDestinationPathForFileObj(configGroupFileObj: File) {
  const DestinationPathLens = pipe(L.id<File>(), L.prop('destinationPath'));
  return pipe(configGroupFileObj, DestinationPathLens.get);
}

function undoOperationPerformedByLinkCmd(destinationPaths: string[]) {
  const undoOperation = flow(
    removeEntityAt,
    TE.map(deletedFilePath => `Deleted file at ${deletedFilePath}`)
  );

  return pipe(destinationPaths, A.wilt(T.ApplicativePar)(undoOperation));
}

function stopSpinnerOnSuccess() {
  return pipe(
    'Unlinked config group files from their destinations',
    indentText(),
    spinner.succeed.bind(spinner)
  );
}

function stopSpinnerOnError() {
  return pipe(
    'Failed to remove config group files from their destinations. Exiting...',
    indentText(),
    spinner.fail.bind(spinner)
  );
}
