import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as Eq from 'fp-ts/lib/Eq';

import path from 'path';

import { not } from 'fp-ts/lib/Predicate';
import { concatAll } from 'fp-ts/lib/Monoid';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { stat, lstat } from 'fs/promises';
import { fs as fsExtra } from 'zx';
import { flow, identity, pipe } from 'fp-ts/lib/function';
import { compose, lensProp, view } from 'ramda';
import { CONFIG_GRP_DEST_RECORD_FILE_NAME } from '../src/constants';
import { getFilesFromConfigGroup, isNotIgnored } from '@app/configGroup';
import {
  File,
  SourcePath,
  ConfigGroup,
  DestinationPath,
  DestinationRecord,
} from '@types';

export async function isSymlink(filePath: DestinationPath) {
  try {
    const fileStat = await lstat(filePath);

    return fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isHardlink(
  originalFilePath: SourcePath,
  potentialHardlinkFilePath: DestinationPath
) {
  try {
    const fileStats = await Promise.all(
      [originalFilePath, potentialHardlinkFilePath].map(pathName => stat(pathName))
    );

    const [originalFileStats, potentialHardlinkFileStats] = fileStats;

    return originalFileStats.ino === potentialHardlinkFileStats.ino;
  } catch {
    return false;
  }
}

export async function doesPathExist(pathToEntity: string) {
  return await fsExtra.pathExists(pathToEntity);
}

export const checkIfAllPathsAreValid = flow(
  identity<DestinationPath[]>,
  T.traverseArray(destinationPath => () => doesPathExist(destinationPath)),
  T.map(concatAll(MonoidAll))
);

export const getDestinationPathsFromConfigGroups = flow(
  identity<ConfigGroup[]>,
  A.chain(compose(A.map(getDestinationPathFromFileObj), getFilesFromConfigGroup))
);

export function getDestinationPathFromFileObj(configGroupFileObj: File) {
  const destinationPathLens = lensProp<File, 'destinationPath'>('destinationPath');
  return view(destinationPathLens, configGroupFileObj);
}

export function getDestinationPathsOfIgnoredFiles(configGroups: ConfigGroup[]) {
  return pipe(
    configGroups,
    A.chain(
      compose(
        A.filterMap(getDestinationPathsOfIgnoredFileObjs),
        getFilesFromConfigGroup
      )
    )
  );
}

export function getDestinationPathsOfNonIgnoredFiles(configGroups: ConfigGroup[]) {
  return pipe(
    configGroups,
    A.chain(
      compose(
        A.filterMap(getDestinationPathsOfNonIgnoredFileObjs),
        getFilesFromConfigGroup
      )
    )
  );
}

const getDestinationPathsOfIgnoredFileObjs = flow(
  identity<File>,
  O.fromPredicate(not(isNotIgnored)),
  O.map(getDestinationPathFromFileObj)
);

const getDestinationPathsOfNonIgnoredFileObjs = flow(
  identity<File>,
  O.fromPredicate(isNotIgnored),
  O.map(getDestinationPathFromFileObj)
);

export const manualFail = (v: any) => {
  throw new Error(`Manual fail: ${v}`);
};

export const defaultDestRecordEq = Eq.struct({
  '!': S.Eq,
});

export const readRawDestinationRecordFile = async (
  configGroupName: string
): Promise<DestinationRecord> =>
  await fsExtra.readJSON(
    path.join(
      process.env.DOTFILES ?? process.env.DOTS!,
      configGroupName,
      CONFIG_GRP_DEST_RECORD_FILE_NAME
    )
  );
