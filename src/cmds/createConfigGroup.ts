import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';

import { chalk } from 'zx/.';
import { exitCli } from '@app/helpers';
import { match, P } from 'ts-pattern';
import { writeFile } from 'fs/promises';
import { pipe, flow } from 'fp-ts/lib/function';
import { CmdResponse } from '@types';
import { newAggregateError } from '@utils/AggregateError';
import { createDirIfItDoesNotExist, doesPathExist } from '@utils/index';
import { CONFIG_GRP_DEST_RECORD_FILE_NAME, ExitCodes } from '../constants';
import {
  DEFAULT_DEST_RECORD_FILE_CONTENTS,
  generateAbsolutePathToConfigGroupDir,
} from '@app/configGroup';

export default async function main(
  configGroupNames: string[] | [],
  _: string[] = []
) {
  const fatalErrMsg = chalk.red.bold(
    'No config group names were specified. Exiting...'
  );

  const cmdOutput = await match(configGroupNames)
    .with([], () => exitCli(fatalErrMsg, ExitCodes.GENERAL))
    .with(P.array(P.string), (__, value) => createConfigGroupDir(value))
    .exhaustive();

  return typeof cmdOutput === 'function' ? cmdOutput() : cmdOutput;
}

async function createConfigGroupDir(
  configGroupNames: string[]
): Promise<CmdResponse<string[]>> {
  const { left: pathGenerationErrors, right: allAbsPathsToPotentialConfigGroups } =
    generatePathsToPotentialConfigGroupDirs(configGroupNames);

  const { left: warningsForExistingGroups, right: groupCreationOutput } = await pipe(
    allAbsPathsToPotentialConfigGroups,
    A.wilt(T.ApplicativePar)(generateConfigGroupDirForNonExistingOnes)
  )();

  return {
    errors: pathGenerationErrors,
    warnings: warningsForExistingGroups,
    output: groupCreationOutput,
    forTest: allAbsPathsToPotentialConfigGroups,
  };
}

function generatePathsToPotentialConfigGroupDirs(configGroupNames: string[]) {
  return pipe(
    configGroupNames,
    A.map(configGroupName =>
      pipe(
        configGroupName,
        generateAbsolutePathToConfigGroupDir,
        E.fromOption(generateConfigGroupDirPathCreationError(configGroupName))
      )
    ),
    A.separate
  );
}

function generateConfigGroupDirPathCreationError(configGroupName: string) {
  return () =>
    newAggregateError(
      `Error, could not generate a path to the ${configGroupName} config group`
    );
}

function generateConfigGroupDirForNonExistingOnes(absPath: string) {
  return pipe(
    doesPathExist(absPath),
    TE.swap,
    TE.mapLeft(() => `${absPath} already exists. Skipping...`),
    TE.chainW(flow(() => absPath, createDirIfItDoesNotExist, TE.fromTask)),
    TE.chainFirstTaskK(() => createDefaultDestinationRecordFile(absPath)),
    TE.map(() => `${path.basename(absPath)} config group created (${absPath})`)
  ) as TE.TaskEither<string, string>;
}

function createDefaultDestinationRecordFile(configGroupDirPath: string) {
  return async () => {
    const fileName = path.join(configGroupDirPath, CONFIG_GRP_DEST_RECORD_FILE_NAME);

    return await writeFile(
      fileName,
      JSON.stringify(DEFAULT_DEST_RECORD_FILE_CONTENTS),
      'utf-8'
    );
  };
}
