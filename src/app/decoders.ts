import * as d from 'io-ts/lib/Decoder';
import * as E from 'fp-ts/lib/Either';

import path from 'path';

import { expandShellVariablesInString } from '@lib/shellVarStrExpander';
import { DestinationPath, toDestinationPath } from '@types';

export const DestinationPathDecoder: d.Decoder<unknown, DestinationPath> = {
  decode(inp) {
    if (E.isLeft(d.string.decode(inp))) {
      return d.failure(inp, `${inp} is not a string`);
    }

    const potentialAbsPath = expandShellVariablesInString(inp as string);

    return path.isAbsolute(potentialAbsPath)
      ? d.success(toDestinationPath(potentialAbsPath))
      : d.failure(inp, `${inp} is not an absolute file path`);
  },
};
