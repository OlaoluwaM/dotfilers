import * as A from 'fp-ts/lib/Array';
import * as R from 'fp-ts/lib/Record';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as L from 'monocle-ts/lib/Lens';
import * as Eq from 'fp-ts/lib/Eq';
import * as MT from 'monocle-ts/lib/Traversal';

import path from 'path';
import fsExtra from 'fs-extra';

import { values } from 'ramda';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { concatAll } from 'fp-ts/lib/Monoid';
import { EXCLUDE_KEY } from '../src/constants';
import { flow, identity, pipe } from 'fp-ts/lib/function';
import { lstat, stat, writeFile } from 'fs/promises';
import { AnyFunction, ConfigGroup, DestinationPath, File, SourcePath } from '@types';

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

function removeLeadingPathSeparator(dirPath: string) {
  const leadingPathSeparatorRegex = new RegExp(`^${path.sep}+`);
  return S.replace(leadingPathSeparatorRegex, '')(dirPath);
}

export function getRelativePathWithoutLeadingPathSeparator(rootPath: string) {
  return (fullPath: string) =>
    pipe(fullPath, S.replace(rootPath, ''), removeLeadingPathSeparator);
}

export const manualFail = (v: any) => {
  throw new Error(`Manual fail: ${v}`);
};

export const defaultDestRecordEq = Eq.struct({
  [EXCLUDE_KEY]: S.Eq,
});

export function createFile(rootPath: string) {
  return (fileName: string, content: string = ''): T.Task<void> =>
    async () =>
      await writeFile(path.join(rootPath, fileName), content, { encoding: 'utf-8' });
}

export function generatePath(rootPath: string) {
  return (entityName: string) => path.join(rootPath, entityName);
}

export const filenameLens = pipe(L.id<File>(), L.prop('name'));
export const fileBasenameLens = pipe(L.id<File>(), L.prop('basename'));
export const sourcePathLens = pipe(L.id<File>(), L.prop('sourcePath'));
export const destinationPathLens = pipe(L.id<File>(), L.prop('destinationPath'));
export const fileRecordLens = pipe(L.id<ConfigGroup>(), L.prop('fileRecord'));

const fileObjLens = pipe(L.id<ConfigGroup>(), L.prop('files'));

export const getIgnoredFilesFromConfigGroups = (configGroups: ConfigGroup[]) =>
  pipe(
    configGroups,
    A.chain(fileObjLens.get),
    A.filter(({ ignore }) => ignore === true)
  );

export const getNonIgnoredFilesFromConfigGroups = (configGroups: ConfigGroup[]) =>
  pipe(
    configGroups,
    A.chain(fileObjLens.get),
    A.filter(({ ignore }) => ignore === false)
  );

const destinationPathLensFromConfigGroup = pipe(
  fileObjLens,
  L.asTraversal,
  MT.traverse(A.Traversable),
  MT.prop('destinationPath')
);

const fileTraversable = pipe(MT.id<File[]>(), MT.traverse(A.Traversable));

export const getFileNamesFromFiles = (files: File[]) =>
  MT.getAll(files)(pipe(fileTraversable, MT.prop('name'))) as string[];

export const getDestinationPathsFromFiles = (files: File[]) =>
  MT.getAll(files)(
    pipe(fileTraversable, MT.prop('destinationPath'))
  ) as DestinationPath[];

export const getDestinationPathsOfIgnoredFiles = flow(
  getIgnoredFilesFromConfigGroups,
  getDestinationPathsFromFiles
);

const getDestinationPathsForConfigGroup = (configGroup: ConfigGroup) =>
  MT.getAll(configGroup)(destinationPathLensFromConfigGroup) as DestinationPath[];

export const getAllDestinationPathsFromConfigGroups = (
  configGroups: ConfigGroup[]
) => pipe(configGroups, A.chain(getDestinationPathsForConfigGroup));

const getFileNamesFromConfigGroup = (configGroup: ConfigGroup) =>
  pipe(fileRecordLens.get(configGroup), R.map(filenameLens.get), values);

export const getFileNamesFromConfigGroups = (configGroups: ConfigGroup[]) =>
  pipe(configGroups, A.chain(getFileNamesFromConfigGroup));

export function normalizeStdout(stdout: string) {
  const SPACE_DELIMITER = '   ';
  return pipe(
    stdout,
    S.replace(NEW_LINE_CHAR_REGEX, SPACE_DELIMITER),
    S.trim,
    S.split(SPACE_DELIMITER)
  );
}

export const NEW_LINE_CHAR_REGEX = /\r?\n|\r/g;

export type ExcludeFn<T> = T extends AnyFunction ? never : T;
export type ExtractFn<T> = T extends AnyFunction ? T : never;
