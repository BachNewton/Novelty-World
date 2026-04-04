import Link from "next/link";
import { Button } from "@/shared/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-text-muted">404</h1>
      <p className="text-text-secondary">This page doesn&apos;t exist yet.</p>
      <Link href="/">
        <Button variant="secondary">Back to Novelty World</Button>
      </Link>
    </div>
  );
}
