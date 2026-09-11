import { humanise, statusTone } from "@/lib/utils";

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`badge ${statusTone(value)}`}>{humanise(value)}</span>
  );
}
