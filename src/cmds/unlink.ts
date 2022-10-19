import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/Lens';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RC from 'fp-ts/lib/Record';

import { match, P } from 'ts-pattern';
import { ExitCodes } from '../constants';
import { pipe, flow } from 'fp-ts/lib/function';
import { removeEntityAt } from '../utils/index';
import { lensProp, view } from 'ramda';
import { DestinationPath, File, ConfigGroup, CmdResponse } from '@types';
import {
  ParserOutput,
  default as parseArgv,
  optionConfigConstructor,
} from '@lib/arg-parser';
import {
  isNotIgnored,
  getFilesFromConfigGroup,
  default as createConfigGroupObjs,
} from '@app/configGroup';
import {
  exitCli,
  exitCliWithCodeOnly,
  getPathsToAllConfigGroupDirsInExistence,
} from '@app/helpers';

interface ParsedCmdOptions {
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

  // eslint-disable-next-line no-return-await
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
