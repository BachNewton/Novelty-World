export function ErrorBox({ message }: { message: string }) {
  return (
    <pre className="overflow-x-auto rounded border border-(--bt-danger) p-2 text-xs whitespace-pre-wrap text-(--bt-danger)">
      {message}
    </pre>
  );
}
