import * as TE from 'fp-ts/lib/TaskEither';

import chalk from 'chalk';

import { CmdFnWithTestOutput, CmdOptions, PositionalArgs } from '@types';

const helpString = `
Olaoluwa Mustapha <olaolum@pm.me>
Dotfilers is a CLI tool that keeps system configuration (dotfiles) management sane and simple

${chalk.yellow.bold('USAGE:')}
  dotfilers (COMMAND|ALIASES) <config-groups...> [OPTIONS...]

${chalk.yellow.bold('COMMANDS:')}
  link                         Symlinks the non-ignored dotfiles within the passed config groups to their specified destination
  unlink                       Removes previously linked dotfiles from their destinations. Undoes the operation of the link command
  create                       Creates a new config group
  sync                         Syncs (commit and push) changes to connected git repository.

${chalk.yellow.bold('ALIASES:')}
  ln                           Alias for the link command
  un                           Alias for the unlink command
  c                            Alias for the create command
  s                            Alias for the sync command

${chalk.yellow.bold('OPTIONS:')}
  -m, --message                Used with the sync command to provide a custom commit message

${chalk.yellow.bold('FLAGS:')}
  -c, --copy                   Used with the link command. Copies dotfiles to their destination instead of symlinking them
  -H, --hardlink               Used with the link command. Hardlinks dotfiles to their destination instead of symlinking them
  -h, --help                   Show this message.
  -v, --version                Output version information.
  -q, --quiet                  Suppress stdout output, but not stderr output
  -y, --yes                    Used with both the link and unlink commands to bypass confirmation prompt and attempt to operate on all config groups
  -i, --interactive            Used with both the link and unlink commands to allow users pick, from a list, the config groups they wish to operate on

${chalk.yellow.bold('EXAMPLES:')}
  dotfilers link config-group1 config-group2 config-group3
  dotfilers unlink config-group2 config-group3

  dotfilers sync -m "Update!"
  dotfiles create new-config-group1 new-config-group2

${chalk.yellow.bold('MORE INFO:')}
  With the link command, you cannot use both the copy and hardlink flags at once. Doing so will revert to the default behavior of using symlinks
  If you wanna learn more, you can read the documentation at https://github.com/OlaoluwaM/dotfilers
`;

export default function main(
  _: PositionalArgs,
  __: CmdOptions
): ReturnType<CmdFnWithTestOutput<null>> {
  return TE.right({
    errors: [],
    warnings: [],
    output: [getHelpString()],
    testOutput: null,
  });
}

export function getHelpString(): string {
  return helpString.trim();
}
