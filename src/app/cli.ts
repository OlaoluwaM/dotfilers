import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import linkCmd from '@cmds/link';
import unlinkCmd from '@cmds/unlink';
import createConfigGroupCmd from '@cmds/createConfigGroup';

import { not } from 'fp-ts/lib/Predicate';
import { log } from 'fp-ts/lib/Console';
import { pipe } from 'fp-ts/lib/function';
import { ExitCodes } from '../constants';
import { isOptionLike } from '@lib/minimal-argp/src/utils';
import { LiteralUnion } from 'type-fest';
import { getHelpString } from '@cmds/help';
import { splitWhen, slice } from 'ramda';
import { exitCliWithCodeOnly } from './helpers';
import { default as _syncCmd } from '@cmds/sync';
import { logErrors, logOutput } from '@utils/index';
import {
  CmdOptions,
  toCmdOptions,
  PositionalArgs,
  toPositionalArgs,
  CmdFnWithTestOutput,
} from '@types';

type Commands = 'link' | 'unlink' | 'sync' | 'create';
type CommandAliases = 'ln' | 'un' | 's' | 'c';

export type CommandsAndAliases = Commands | CommandAliases;

type CommandCenter = {
  readonly [Key in Commands]: CmdFnWithTestOutput<unknown>;
};

export type CliInputs = LiteralUnion<CommandAliases, string>[];

function generateCommandCenter(): CommandCenter {
  const syncCmd = _syncCmd();

  return {
    link: linkCmd,
    unlink: unlinkCmd,
    create: createConfigGroupCmd,
    sync: syncCmd,
  };
}

export default function generateCmdHandlerFn(
  commandToPerform: CommandsAndAliases
): CmdFnWithTestOutput<unknown> {
  const commandCenter = generateCommandCenter();

  return (cmdArguments: PositionalArgs, cmdOptions: CmdOptions) => {
    switch (commandToPerform) {
      case 'link':
      case 'ln':
        return commandCenter.link(cmdArguments, cmdOptions);

      case 'unlink':
      case 'un':
        return commandCenter.unlink(cmdArguments, cmdOptions);

      case 'create':
      case 'c':
        return commandCenter.create(cmdArguments, cmdOptions);

      case 'sync':
      case 's':
        return commandCenter.sync(cmdArguments, cmdOptions);

      default:
        return handleInvalidCommand(commandToPerform);
    }
  };
}

function getAllCommandsAndTheirAliases(): CommandsAndAliases[] {
  return ['link', 'ln', 'unlink', 'un', 'c', 'create', 'sync', 's'];
}

export function getCliCommand(cliInputs: CliInputs) {
  return pipe(
    cliInputs,
    A.findFirst(possibleCliCmdStr =>
      pipe(getAllCommandsAndTheirAliases(), A.elem(S.Eq)(possibleCliCmdStr))
    ),
    O.getOrElseW(() => 'no command')
  ) as CommandsAndAliases;
}

export function collectCmdArguments(
  cliInputs: CliInputs,
  cliCmd: CommandsAndAliases
): PositionalArgs {
  return pipe(
    cliInputs,
    splitWhen<CliInputs[number]>(cliInput => cliInput === cliCmd),
    A.last,
    O.getOrElseW(() => []),
    slice(1, Infinity)<string>,
    A.takeLeftWhile(not(isOptionLike)),
    toPositionalArgs
  );
}

export function collectCmdOptions(
  cliInputs: CliInputs,
  cliCmd: CommandsAndAliases
): CmdOptions {
  return pipe(
    cliInputs,
    A.filter(cliInput => cliInput !== cliCmd),
    A.difference(S.Eq)(collectCmdArguments(cliInputs, cliCmd)),
    toCmdOptions
  );
}

export function getCliInputsFromArgv(argv: string[]) {
  const INDEX_OF_CLI_ARGS = 2;
  return pipe(argv, slice(INDEX_OF_CLI_ARGS, Infinity)<string>) as CliInputs;
}

function handleInvalidCommand(badCommand: string) {
  return pipe(
    logErrors([generateBadCommandErrorMessage(badCommand)]),
    IO.chain(() => logOutput([getHelpString()])),
    IO.chain(() => log('\n')),
    IO.chain(() => exitCliWithCodeOnly(ExitCodes.COMMAND_NOT_FOUND)),
    TE.left
  );
}

function generateBadCommandErrorMessage(badCommand: string) {
  return `No action was taken because ${badCommand} is not a valid command. Please refer to help output below for valid usage 😄`;
}
