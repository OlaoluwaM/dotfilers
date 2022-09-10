import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import { chalk } from 'zx';
import { match, P } from 'ts-pattern';
import { ExitCodes } from '../constants';
import { pipe, flow } from 'fp-ts/lib/function';
import { removeEntityAt } from '../utils/index';
import { lensProp, view } from 'ramda';
import { DestinationPath, File, ConfigGroups, CmdResponse } from '@types';
import {
  isNotIgnored,
  getFilesFromConfigGrp,
  default as createConfigGrpObjs,
} from '@app/configGrpOps';
import {
  exitCli,
  exitCliWithCodeOnly,
  optionallyGetAllConfigGrpNamesInExistence,
} from '@app/helpers';

export default async function main(passedArguments: string[]) {
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
    .with({ _tag: 'Some' }, (_, some) => unlinkCmd(some.value))
    .with(P.array(P.string), (_, value) => unlinkCmd(value))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
}

async function unlinkCmd(
  configGrpNames: string[]
): Promise<CmdResponse<DestinationPath[]>> {
  const configGrpsWithErrors = await createConfigGrpObjs(configGrpNames)();
  const { left: configGrpCreationErrs, right: configGrps } = configGrpsWithErrors;

  const validConfigGrpDestinationPaths =
    getDestinationPathsForAllValidFiles(configGrps);

  const deletionOperationFeedback = await pipe(
    validConfigGrpDestinationPaths,
    undoOperationPerformedByLinkCmd
  )();
  const { left: deletionErrors, right: deletionOutput } = deletionOperationFeedback;

  return {
    errors: [...deletionErrors, ...configGrpCreationErrs],
    output: deletionOutput,
    forTest: validConfigGrpDestinationPaths,
  };
}

function getDestinationPathsForAllValidFiles(configGrps: ConfigGroups) {
  return pipe(
    configGrps,
    A.map(getFilesFromConfigGrp),
    A.flatten,
    A.filterMap(getDestinationPathForFileObjsThatAreNotIgnored)
  );
}

function getDestinationPathForFileObjsThatAreNotIgnored(fileObj: File) {
  return pipe(
    fileObj,
    O.fromPredicate(isNotIgnored),
    O.map(getDestinationPathForFileObj)
  );
}

function getDestinationPathForFileObj(configGrpFileObj: File) {
  const destinationPathLens = lensProp<File, 'destinationPath'>('destinationPath');
  return view(destinationPathLens, configGrpFileObj);
}

function undoOperationPerformedByLinkCmd(destinationPaths: string[]) {
  const undoOperation = flow(
    removeEntityAt,
    TE.map(deletedFilePath => `Deleted file at ${deletedFilePath}`)
  );

  return pipe(destinationPaths, A.wilt(T.ApplicativePar)(undoOperation));
}
