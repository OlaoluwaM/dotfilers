import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import path from 'path';
import fsExtra from 'fs-extra';

import { _dirname } from '../constants';
import { flow, pipe } from 'fp-ts/lib/function';
import { PositionalArgs, CmdOptions, CmdFnWithTestOutput } from '@types';

export default function main(
  _: PositionalArgs,
  __: CmdOptions
): ReturnType<CmdFnWithTestOutput<null>> {
  return pipe(
    getCliVersion(),
    TE.fromIO,
    TE.map(cliVersion => ({
      errors: [],
      warnings: [],
      output: [`v${cliVersion}`],
      testOutput: null,
    }))
  );
}

interface PackageJson {
  readonly version: string;
}

function getCliVersion() {
  return pipe(
    _dirname,
    flow(path.dirname, (dirname: string) => path.join(dirname, 'package.json')),
    IO.of,
    IO.map<string, PackageJson>(fsExtra.readJSONSync),
    IO.map(({ version }) => version)
  );
}
