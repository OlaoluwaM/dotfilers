import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as Eq from 'fp-ts/lib/Eq';

import path from 'path';

import { id } from '@utils/index';
import { not } from 'fp-ts/lib/Predicate';
import { concatAll } from 'fp-ts/lib/Monoid';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { flow, pipe } from 'fp-ts/lib/function';
import { stat, lstat } from 'fs/promises';
import { fs as fsExtra } from 'zx';
import { compose, lensProp, view } from 'ramda';
import { CONFIG_GRP_DEST_RECORD_FILE_NAME } from '../src/constants';
import { getFilesFromConfigGrp, isNotIgnored } from '@app/configGrpOps';
import {
  File,
  SourcePath,
  ConfigGroups,
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
  id<DestinationPath[]>,
  A.map(destinationPath => () => doesPathExist(destinationPath)),
  T.sequenceArray,
  T.map(concatAll(MonoidAll))
);

export const getDestinationPathsFromConfigGrp = flow(
  id<ConfigGroups>,
  A.map(compose(A.map(getDestinationPathFromFileObj), getFilesFromConfigGrp)),
  A.flatten
);

export function getDestinationPathFromFileObj(configGrpFileObj: File) {
  const destinationPathLens = lensProp<File, 'destinationPath'>('destinationPath');
  return view(destinationPathLens, configGrpFileObj);
}

export function getDestinationPathsOfIgnoredFiles(configGrps: ConfigGroups) {
  return pipe(
    configGrps,
    A.map(
      compose(
        A.filterMap(getDestinationPathsOfIgnoredFileObjs),
        getFilesFromConfigGrp
      )
    ),
    A.flatten
  );
}

const getDestinationPathsOfIgnoredFileObjs = flow(
  id<File>,
  O.fromPredicate(not(isNotIgnored)),
  O.map(getDestinationPathFromFileObj)
);

export const manualFail = (v: any) => {
  throw new Error(`Manual fail: ${v}`);
};

export const defaultDestRecordEq = Eq.struct({
  '!': S.Eq,
});

export const readRawDestinationRecordFile = async (
  configGrpName: string
): Promise<DestinationRecord> =>
  await fsExtra.readJSON(
    path.join(
      process.env.DOTFILES ?? process.env.DOTS!,
      configGrpName,
      CONFIG_GRP_DEST_RECORD_FILE_NAME
    )
  );
