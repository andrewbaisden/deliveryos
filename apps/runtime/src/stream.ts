export function compareStreamIds(left: string, right: string) {
  const parse = (value: string): [bigint, bigint] => {
    const [milliseconds = "0", sequence = "0"] = value.split("-");
    return [BigInt(milliseconds), BigInt(sequence)];
  };
  const [leftMs, leftSequence] = parse(left);
  const [rightMs, rightSequence] = parse(right);
  if (leftMs !== rightMs) return leftMs < rightMs ? -1 : 1;
  if (leftSequence === rightSequence) return 0;
  return leftSequence < rightSequence ? -1 : 1;
}
