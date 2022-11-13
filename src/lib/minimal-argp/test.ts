/* global test, expect */
import ArgParser from './index';
import { ParserOutput } from './src/types';

const mockOptions = {
  options: {
    force: {
      type: Boolean,
    },
    help: {
      type: Boolean,
      alias: 'h',
    },
    version: {
      type: Boolean,
      alias: 'v',
    },
  },
};

test.each([
  ['no arguments', '', []],
  ['some arguments', '', ['foo', 'bar', 'cat']],
])(
  'Should check that options are properly parsed with valid options in argv and %s',
  (_, __, posArgs) => {
    // Arrange
    const mockArgv = ['--force', '-h', '--version', '-v'].concat(posArgs);

    // Act
    const { options, positionalArgs } = new ArgParser<typeof mockOptions>(
      mockOptions
    ).parse(mockArgv);

    // Assert
    expect(options).toMatchObject<ParserOutput<typeof mockOptions>['options']>({
      force: true,
      help: true,
      version: true,
    });

    expect(positionalArgs.length).toBe(posArgs.length);
    if (positionalArgs.length > 0) expect(positionalArgs).toEqual(posArgs);
  }
);

test.each([
  ['only invalid options are present', '', ['--ffff', '-q', '--top']],
  ['no options are present', '', []],
])('Should check that parser returns reasonable defaults if', (_, __, mockArgv) => {
  // Act
  const { options } = new ArgParser(mockOptions).parse(mockArgv);

  // Assert
  expect(options).toMatchObject<ParserOutput<typeof mockOptions>['options']>({
    force: false,
    help: false,
    version: false,
  });
});

test('Should check that options are parsed correctly even if some options are missing', () => {
  // Arrange
  const newMockOptions = {
    options: {
      ...mockOptions.options,
      all: {
        type: Boolean,
        alias: 'a',
      },
    },
  };

  const mockArgv = ['-a', '--version', '-voila', '--sef', 'pole'];
  // Act
  const { options } = new ArgParser<typeof newMockOptions>(newMockOptions).parse(
    mockArgv
  );

  // Assert
  expect(options).toMatchObject<ParserOutput<typeof newMockOptions>['options']>({
    force: false,
    help: false,
    version: true,
    all: true,
  });
});
