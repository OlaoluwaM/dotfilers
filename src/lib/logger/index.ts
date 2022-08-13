import { IO } from 'fp-ts/lib/IO';
import { chalk } from 'zx/.';
import { LogTypes } from './types';
import { HKT, URIS, URIS2, Kind, Kind2 } from 'fp-ts/lib/HKT';
import { Chain, chainFirst as chainFirst_ } from 'fp-ts/lib/Chain';

interface Logger<F> extends Chain<F> {
  readonly log: (message: string) => HKT<F, void>;
}

export interface Logger1<F extends URIS> extends Chain<F> {
  readonly log: (message: string) => Kind<F, void>;
}

export interface Logger2<F extends URIS2> extends Chain<F> {
  readonly log: <E>(message: string) => Kind2<F, E, void>;
}

export function logBefore<F extends URIS>(
  logger: Logger1<F>
): (message: string) => <A>(ma: Kind<F, A>) => Kind<F, A>;
export function logBefore<F extends URIS2>(
  logger: Logger2<F>
): (message: string) => <E, A>(ma: Kind2<F, E, A>) => Kind2<F, E, A>;
export function logBefore<F>(
  logger: Logger<F>
): (message: string) => <A>(ma: HKT<F, A>) => HKT<F, A> {
  return (message: string) => ma => logger.chain(logger.log(message), () => ma);
}

export function logAfter<F extends URIS2>(
  logger: Logger2<F>
): (message: string) => <E, A>(ma: Kind2<F, E, A>) => Kind2<F, E, A>;
export function logAfter<F extends URIS>(
  logger: Logger1<F>
): (message: string) => <A>(ma: Kind<F, A>) => Kind<F, A>;
export function logAfter<F>(
  logger: Logger<F>
): (message: string) => <A>(ma: HKT<F, A>) => HKT<F, A> {
  const chainFirst = chainFirst_(logger);
  return (message: string) => chainFirst(() => logger.log(message));
}

export const customConsoleTransporters: {
  [key in LogTypes]: <A>(val: A) => IO<void>;
} = {
  INFO(message) {
    return () => console.info(chalk.blueBright.bold('INFO: ') + message);
  },

  WARN(message) {
    return () => console.warn(chalk.yellowBright.bold('WARNING: ') + message);
  },

  DEBUG(message) {
    return () => console.debug(chalk.grey.bold('DEBUG: ') + message);
  },

  ERROR(message) {
    return () => console.error(chalk.redBright.bold('ERROR: ') + message);
  },
};
