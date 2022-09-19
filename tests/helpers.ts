import * as A from 'fp-ts/lib/Array';
import * as L from 'monocle-ts/Lens';
import * as R from 'fp-ts/lib/Record';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as MT from 'monocle-ts/Traversal';
import * as Eq from 'fp-ts/lib/Eq';

import path from 'path';

import { not } from 'fp-ts/lib/Predicate';
import { concatAll } from 'fp-ts/lib/Monoid';
import { MonoidAll } from 'fp-ts/lib/boolean';
import { fs as fsExtra } from 'zx';
import { flow, identity, pipe } from 'fp-ts/lib/function';
import { stat, lstat, writeFile } from 'fs/promises';
import { compose, lensProp, values, view } from 'ramda';
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

const fileTraversable = pipe(
  MT.id<File[]>(),
  MT.traverse(A.Traversable),
);

export const getFileNamesFromFiles = (files: File[]) =>
  MT.getAll(files)(pipe(fileTraversable, MT.prop('name'))) as string[];

export const getDestinationPathsFromFiles = (files: File[]) =>
  MT.getAll(files)(pipe(fileTraversable, MT.prop('destinationPath'))) as DestinationPath[];

const getDestinationPathsForConfigGroup = (configGroup: ConfigGroup) =>
  MT.getAll(configGroup)(destinationPathLensFromConfigGroup) as DestinationPath[];

export const getDestinationPathsForConfigGroups = (configGroups: ConfigGroup[]) =>
  pipe(configGroups, A.chain(getDestinationPathsForConfigGroup));

const getFileNamesFromConfigGroup = (configGroup: ConfigGroup) =>
  pipe(fileRecordLens.get(configGroup), R.map(filenameLens.get), values);

export const getFileNamesFromConfigGroups = (configGroups: ConfigGroup[]) =>
  pipe(configGroups, A.chain(getFileNamesFromConfigGroup));
