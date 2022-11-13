import ArgParser from './src/index';
import { ParserParams } from './src/types';

export default function parseCliArgs<ParserInput extends ParserParams>(
  parserConfig: ParserInput
) {
  return (args: string[]) => new ArgParser<ParserInput>(parserConfig).parse(args);
}

export { ArgParser };
export type { ParserParams };
