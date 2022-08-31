import * as d from 'io-ts/lib/Decoder';
import * as E from 'fp-ts/lib/Either';

import path from 'path';

import { iso } from 'newtype-ts';
import { AbsFilePath } from '@types';

const isoAbsFilePath = iso<AbsFilePath>();

export const toAbsFilePath = isoAbsFilePath.wrap;
export const AbsFilePathDecoder: d.Decoder<unknown, AbsFilePath> = {
  decode(inp) {
    if (E.isLeft(d.string.decode(inp))) {
      return d.failure(inp, `${inp} is not a string`);
    }

    return path.isAbsolute(inp as string)
      ? d.success(toAbsFilePath(inp as string))
      : d.failure(inp, `${inp} is not an absolute file path`);
  },
};
