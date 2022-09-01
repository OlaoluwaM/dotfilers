import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import * as TE from 'fp-ts/lib/TaskEither';
import * as RA from 'fp-ts/lib/ReadonlyArray';
import * as RNEA from 'fp-ts/lib/ReadonlyNonEmptyArray';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { doesPathExist } from '@utils/index';
import { newAggregateError, addError } from '@utils/AggregateError';
import { SHELL_VARS_TO_CONFIG_GRP_DIRS_STR } from '../constants';
import {
  isValidShellExpansion,
  expandShellVariablesInString,
  createConfigGrpFromConfigGrpPath,
  generateConfigGrpNamePathWithShellVars,
  updateConfigGrpObjWithNecessaryMetaData,
} from './helpers';

export default function createConfigGrpObjs(configGrpNames: string[]) {
  return pipe(
    configGrpNames,
    A.wilt(T.ApplicativePar)(transformConfigGrpNameIntoConfigGrpObj)
  );
}

function transformConfigGrpNameIntoConfigGrpObj(configGrpName: string) {
  return pipe(
    configGrpName,
    generateAbsolutePathToConfigGrpDir,
    TE.fromOption(() => newAggregateError('')),
    TE.chain(doesPathExist),
    TE.mapLeft(handleConfigGrpDirPathValidityErr(configGrpName)),
    TE.chain(createConfigGrpFromConfigGrpPath),
    TE.map(updateConfigGrpObjWithNecessaryMetaData)
  );
}

function generateAbsolutePathToConfigGrpDir(configGrpName: string) {
  return pipe(
    configGrpName,
    generateConfigGrpNamePathWithShellVars,
    RNEA.map(expandShellVariablesInString),
    RA.filter(not(isValidShellExpansion)),
    RA.head
  );
}

function handleConfigGrpDirPathValidityErr(configGrpName: string) {
  return addError(
    `It looks like the '${configGrpName}' config group does not exist. Is the required environment variable (${SHELL_VARS_TO_CONFIG_GRP_DIRS_STR}) set?`
  );
}
