import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RC from 'fp-ts/lib/Record';

import { match, P } from 'ts-pattern';
import { ExitCodes } from '../constants';
import { pipe, flow } from 'fp-ts/lib/function';
import { removeEntityAt } from '../utils/index';
import { lensProp, view } from 'ramda';
import { optionConfigConstructor } from '@lib/arg-parser';
import { DestinationPath, File, ConfigGroup, CmdResponse } from '@types';
import {
  isNotIgnored,
  getFilesFromConfigGroup,
  default as createConfigGroupObjs,
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

export default async function main(
  cmdArguments: string[],
  cmdOptions: string[] = []
) {
  const parsedCmdOptions: ParsedCmdOptions = parseUnlinkCmdOptions(cmdOptions);

  const configGroupNamesOrDirPaths = A.isEmpty(cmdArguments)
    ? await getPathsToAllConfigGroupDirsInExistence(parsedCmdOptions.yes)
    : cmdArguments;

  const cmdOutput = await match(configGroupNamesOrDirPaths)
    .with(ExitCodes.OK as 0, exitCliWithCodeOnly)
    .with({ _tag: 'Left' }, (_, { left }) =>
      exitCli(left.message, ExitCodes.GENERAL)
    )
    .with({ _tag: 'Right' }, (_, { right }) => unlinkCmd(right))
    .with(P.array(P.string), (_, configGroupNames) => unlinkCmd(configGroupNames))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
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

async function unlinkCmd(
  configGroupNamesOrDirPaths: string[]
): Promise<CmdResponse<DestinationPath[]>> {
  const configGroupsWithErrors = await createConfigGroupObjs(
    configGroupNamesOrDirPaths
  )();

  const { left: configGroupCreationErrs, right: configGroups } =
    configGroupsWithErrors;

  const validConfigGroupDestinationPaths =
    getDestinationPathsForAllNonIgnoredFiles(configGroups);

  const deletionOperationFeedback = await pipe(
    validConfigGroupDestinationPaths,
    undoOperationPerformedByLinkCmd
  )();
  const { left: deletionErrors, right: deletionOutput } = deletionOperationFeedback;

  return {
    errors: [...deletionErrors, ...configGroupCreationErrs],
    output: deletionOutput,
    forTest: validConfigGroupDestinationPaths,
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
  const destinationPathLens = lensProp<File, 'destinationPath'>('destinationPath');
  return view(destinationPathLens, configGroupFileObj);
}

function undoOperationPerformedByLinkCmd(destinationPaths: string[]) {
  const undoOperation = flow(
    removeEntityAt,
    TE.map(deletedFilePath => `Deleted file at ${deletedFilePath}`)
  );

  return pipe(destinationPaths, A.wilt(T.ApplicativePar)(undoOperation));
}
