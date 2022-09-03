import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';

import { chalk } from 'zx/.';
import { exitCli } from '@app/helpers';
import { match, P } from 'ts-pattern';
import { ExitCodes } from 'src/constants';
import { pipe, flow } from 'fp-ts/lib/function';
import { CmdResponse } from '@types';
import { newAggregateError } from '@utils/AggregateError';
import { generateAbsolutePathToConfigGrpDir } from '@app/configGrpOps';
import { createDirIfItDoesNotExist, doesPathExist } from '@utils/index';

export default async function main(configGrpNames: string[] | [], _: string[] = []) {
  const fatalErrMsg = chalk.red.bold(
    'No config group names were specified. Exiting...'
  );

  const cmdOutput = await match(configGrpNames)
    .with([], () => exitCli(fatalErrMsg, ExitCodes.GENERAL))
    .with(P.array(P.string), (__, value) => createConfigGrpDir(value))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
}

async function createConfigGrpDir(
  configGrpNames: string[]
): Promise<CmdResponse<string[]>> {
  const { left: pathGenerationErrors, right: allAbsPathsToPotentialConfigGrps } =
    generatePathsToPotentialConfigGrps(configGrpNames);

  const { left: warningsForExistingGrps, right: groupCreationOutput } = await pipe(
    allAbsPathsToPotentialConfigGrps,
    A.wilt(T.ApplicativePar)(generateConfigGroupDirForNonExistingOnes)
  )();

  return {
    errors: pathGenerationErrors,
    warnings: warningsForExistingGrps,
    output: groupCreationOutput,
    forTest: allAbsPathsToPotentialConfigGrps,
  };
}

function generatePathsToPotentialConfigGrps(configGrpNames: string[]) {
  return pipe(
    configGrpNames,
    A.map(configGrpName =>
      pipe(
        configGrpName,
        generateAbsolutePathToConfigGrpDir,
        E.fromOption(handleAbsPathToPotentialConfigGrpError(configGrpName))
      )
    ),
    A.separate
  );
}

function handleAbsPathToPotentialConfigGrpError(configGrpName: string) {
  return () =>
    newAggregateError(
      `Error, could not generate a path to the ${configGrpName} config group`
    );
}

function generateConfigGroupDirForNonExistingOnes(absPath: string) {
  return pipe(
    doesPathExist(absPath),
    TE.swap,
    TE.mapLeft(() => `${absPath} already exists. Skipping...`),
    TE.chain(flow(() => absPath, createDirIfItDoesNotExist, TE.fromTask)),
    TE.map(() => `${path.basename(absPath)} config group created (${absPath})`)
  ) as TE.TaskEither<string, string>;
}
