import * as T from 'fp-ts/lib/Task';
import * as A from 'fp-ts/lib/Array';

import { flow } from 'fp-ts/lib/function';
import { concatAll } from 'fp-ts/lib/Monoid';
import { ConfigGroup, ConfigGroups, File } from '@types';
import { stat, lstat } from 'fs/promises';
import { fs as fsExtra } from 'zx';
import { MonoidAll, MonoidAny } from 'fp-ts/lib/boolean';
import { id } from '@utils/index';
import { compose, lensProp, view } from 'ramda';
import { getFilesFromConfigGrp } from '@app/configGrpOps';

export async function isSymlink(filePath: string) {
  try {
    const fileStat = await lstat(filePath);

    return fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isHardlink(
  originalFilePath: string,
  potentialHardlinkFilePath: string
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
  const pathExists = await fsExtra.pathExists(pathToEntity);
  return pathExists;
}

export const checkIfAllPathsAreValid = flow(
  id<string[]>,
  A.map(destinationPath => () => doesPathExist(destinationPath as string)),
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
