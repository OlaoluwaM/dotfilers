import * as O from 'fp-ts/lib/Option';
import * as TE from 'fp-ts/lib/TaskEither';

import parseCliArgs from '@lib/minimal-argp';

import { not } from 'fp-ts/lib/Predicate';
import { pipe } from 'fp-ts/lib/function';
import { ApplicativePar } from 'fp-ts/lib/Task';
import { wilt, map, filter, head } from 'fp-ts/lib/Array';
import { CommandArgs, ConfigGroup } from '@types';
import { id, doesPathExist, newError, newAggregateError } from '@utils';
import {
  parseConfigGrpPath,
  isValidShellExpansion,
  expandShellVariablesInString,
  updateConfigGrpFilesWithNecessaryMetaData,
} from '@app/helpers';

const linkCmdCliOptionsConfig = {
  options: {
    hardlink: {
      type: Boolean,
      alias: 'H',
    },
    copy: {
      type: Boolean,
      alias: 'c',
    },
  },
} as const;

export default async function link(commandArgs: CommandArgs) {
  const { options, positionalArgs: configGrpNames } = parseArgs(commandArgs);

  const configGroups = convertConfigGrpNamesIntoObjs(configGrpNames);
  const response = await configGroups();
  console.log(response.left.map(aE => aE.aggregatedMessages));

  // performDesiredOperationBasedOnOptionsPassed(options, configGroups);
}

function parseArgs(commandArgs: CommandArgs) {
  return pipe(commandArgs, parseCliArgs(linkCmdCliOptionsConfig));
}

function convertConfigGrpNamesIntoObjs(configGrpNames: string[]) {
  return pipe(configGrpNames, wilt(ApplicativePar)(parseConfigGrpName()));
}

function parseConfigGrpName() {
  return (configGrpName: string) =>
    pipe(
      configGrpName,
      generateAbsolutePathToConfigGroupDir,

      O.map(determineConfigDirPathValidity),
      O.fold(
        () =>
          TE.left(
            newError(
              `Error, could not find config group '${configGrpName}'. Please ensure that the required shell variables are set`
            )
          ),
        id
      ),

      TE.chain(parseConfigGrpPathToConfigObj),
      TE.mapLeft((error: Error) =>
        newAggregateError([
          error.message,
          `It looks like the '${configGrpName}' config group is not valid or may not exist`,
        ])
      )
    );
}

function generateAbsolutePathToConfigGroupDir(configGrpName: string) {
  const configGroupNamePathWithShellVars =
    generateConfigGroupNamePathWithShellVars(configGrpName);

  return pipe(
    configGroupNamePathWithShellVars,
    map(expandShellVariablesInString),
    filter(not(isValidShellExpansion)),
    (paths: string[]) => head<string>(paths)
  );
}
function generateConfigGroupNamePathWithShellVars(configGroupName: string) {
  return [`$DOTFILES/${configGroupName}`, `$DOTS/${configGroupName}`];
}

function determineConfigDirPathValidity(configGroupPath: string) {
  return pipe(configGroupPath, getPathIfItExists);
}
function getPathIfItExists(pathToCheck: string) {
  return TE.tryCatch(
    () => doesPathExist(pathToCheck),
    reason => reason as Error
  );
}

function parseConfigGrpPathToConfigObj(verifiedConfigGroupPath: string) {
  return pipe(
    verifiedConfigGroupPath,
    generateConfigGrpObj,
    TE.map(updateConfigGrpFilesWithNecessaryMetaData)
  );
}
function generateConfigGrpObj(configGrpPath: string) {
  return TE.tryCatch<Error, ConfigGroup>(
    () => parseConfigGrpPath(configGrpPath),
    reason => reason as Error
  );
}

// function performDesiredOperationBasedOnOptionsPassed(
//   options: { readonly [x: string]: string | boolean },
//   configGroups: any
// ) {
//   throw new Error('Function not implemented.');
// }
