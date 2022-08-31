import * as A from 'fp-ts/lib/Array';

import { pipe } from 'fp-ts/lib/function';
import { ConfigGroup } from '@types';
import { stat, lstat } from 'fs/promises';
import { fs as fsExtra } from 'zx';

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
