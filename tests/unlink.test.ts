import prompts from 'prompts';

import { default as linkCmd } from '@cmds/link';
import { default as unlinkCmd } from '@cmds/unlink';

import { TEST_DATA_DIR_PREFIX } from './setup';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { checkIfAllPathsAreValid } from './helpers';

const UNLINK_TEST_DATA_DIR = `${TEST_DATA_DIR_PREFIX}/unlink`;
const UNLINK_TEST_ASSERT_DIR = `${UNLINK_TEST_DATA_DIR}/mock-home`;

beforeAll(() => {
  process.env.HOME = UNLINK_TEST_ASSERT_DIR;

  process.env.DOTS = `${UNLINK_TEST_DATA_DIR}/mock-dots`;
  process.env.DOTFILES = `${UNLINK_TEST_DATA_DIR}/mock-dots`;
});

const VALID_MOCK_CONFIG_GRP_NAMES = ['git', 'bat', 'neovim', 'npm'];

describe('Tests for the happy path', () => {
  test('Should ensure that unlink command can undo result of the link command', async () => {
    // Arrange
    await linkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

    // Act
    const {
      errors,
      output,
      forTest: destinationPaths,
    } = await unlinkCmd(VALID_MOCK_CONFIG_GRP_NAMES);

    console.log({ errors, output });

    const areAllDestinationFilesPresentAtTheirDestinationPaths =
      await checkIfAllPathsAreValid(destinationPaths)();

    // Assert
    expect(areAllDestinationFilesPresentAtTheirDestinationPaths).toBeFalsy();
  });
});
