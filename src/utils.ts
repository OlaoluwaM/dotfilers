export function normalizeProcessArgs(): string[] {
  const STARTING_INDEX_OF_PROCESS_ARGS = 2
  const normalizedProcessArgs = process.argv.slice(STARTING_INDEX_OF_PROCESS_ARGS)

  return normalizedProcessArgs
}
