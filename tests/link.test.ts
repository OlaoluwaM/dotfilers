/* global describe, test, expect */
import link from '@cmds/link';

test('For inspection of correctness', async () => {
  // Arrange
  const dummyCmdArgs = ['npm', 'shell', 'bat', 'dfde', 'dwew'];
  // Act
  await link(dummyCmdArgs);
  // const responseEither = await somePromise();

  // console.log(JSON.stringify(responseEither, null, 2));

  // Assert
});
