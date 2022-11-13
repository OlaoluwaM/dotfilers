import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import * as IO from 'fp-ts/lib/IO';
import * as TE from 'fp-ts/lib/TaskEither';

import linkCmd from '@cmds/link';
import unlinkCmd from '@cmds/unlink';
import versionCmd from '@cmds/version';
import createConfigGroupCmd from '@cmds/createConfigGroup';

import { pipe } from 'fp-ts/lib/function';
import { ExitCodes } from '../constants';
import { exitCliWithCodeOnly } from './helpers';
import { default as _syncCmd } from '@cmds/sync';
import { logErrors, logOutput } from '@utils/index';
import { default as helpCmd, getHelpString } from '@cmds/help';
import { CliInputs, CmdOptions, PositionalArgs, CmdFnWithTestOutput } from '@types';

type Commands = 'link' | 'unlink' | 'sync' | 'create' | '--help' | '--version';
type CommandAliases = 'ln' | 'un' | 's' | 'c' | '-h' | '-v';

export type CommandsAndAliases = Commands | CommandAliases;

type CommandCenter = {
  readonly [Key in Commands]: CmdFnWithTestOutput<unknown>;
};

function generateCommandCenter(): CommandCenter {
  const syncCmd = _syncCmd();

  return {
    link: linkCmd,
    unlink: unlinkCmd,
    create: createConfigGroupCmd,
    sync: syncCmd,
    '--help': helpCmd,
    '--version': versionCmd,
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

      case '--version':
      case '-v':
        return commandCenter['--version'](cmdArguments, cmdOptions);

      case '--help':
      case '-h':
        return commandCenter['--help'](cmdArguments, cmdOptions);

      default:
        return handleBadCommand(commandToPerform);
    }
  };
}

export function getCliCommand(rawCliInputs: CliInputs) {
  return pipe(
    rawCliInputs,
    A.head,
    O.getOrElseW(() => 'no command')
  ) as CommandsAndAliases;
}

export function getCliInputsForCmd(rawCliInputs: string[]) {
  const [_, ...restOfInputs] = rawCliInputs;
  return restOfInputs as CliInputs;
}

function handleBadCommand(badCommand: string) {
  return pipe(
    logErrors([generateBadCommandErrorMessage(badCommand)]),
    IO.chain(() => logOutput([getHelpString()])),
    IO.chain(() => exitCliWithCodeOnly(ExitCodes.COMMAND_NOT_FOUND)),
    TE.left
  );
}

function generateBadCommandErrorMessage(badCommand: string) {
  return `No action was taken because ${badCommand} is not a valid command. Please refer to help output below for valid usage 😄`;
}
