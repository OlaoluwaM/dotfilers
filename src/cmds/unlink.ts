import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/Lens';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as RC from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';

import { match, P } from 'ts-pattern';
import { ExitCodes } from '../constants';
import { pipe, flow } from 'fp-ts/lib/function';
import { bind, removeEntityAt } from '../utils/index';
import { optionConfigConstructor } from '@lib/arg-parser';
import {
  File,
  CmdOptions,
  ConfigGroup,
  PositionalArgs,
  DestinationPath,
  CurriedReturnType,
  CmdResponseWithTestOutput,
  CmdFnWithTestOutput,
} from '@types';
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
} from '@app/helpers';

interface ParsedCmdOptions {
  readonly yes: boolean;
}

export default function main(
  cmdArguments: PositionalArgs | [],
  cmdOptions: CmdOptions | []
): ReturnType<CmdFnWithTestOutput<DestinationPath[]>> {
  return pipe(
    TE.of(cmdOptions),
    TE.map(parseUnlinkCmdOptions),

    TE.chain(({ yes }) =>
      A.isEmpty(cmdArguments)
        ? getPathsToAllConfigGroupDirsInExistence(yes)
        : TE.right(cmdArguments)
    ),

    TE.mapLeft(aggregateCmdErrors),
    TE.chainW(flow(unlinkCmd, TE.rightTask))
  );
}

function parseUnlinkCmdOptions(cmdOptions: string[]): ParsedCmdOptions {
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
        parser: () => true,
        isFlag: true,
        aliases: ['y'],
      }),
    },
  };
}

function aggregateCmdErrors(errors: ExitCodes.OK | Error) {
  return match(errors)
    .with(ExitCodes.OK as 0, exitCliWithCodeOnly)
    .with(P.instanceOf(Error), (_, err) => exitCli(err.message, ExitCodes.GENERAL))
    .exhaustive();
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
