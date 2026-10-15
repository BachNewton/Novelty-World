import { Globe } from "lucide-react";
import { Card } from "@/shared/components/ui/card";

const PLAN = [
  "The official rules, written down in full",
  "A careful reference engine, tested rule by rule",
  "A fast engine, checked against the reference",
  "Bots to play against, right in the browser",
];

/** Stands in for the game while its rules and engine are being built. */
export function Risk() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-8">
      <header className="space-y-2 text-center">
        <div className="mx-auto w-fit rounded-md bg-surface-elevated p-3 text-brand-blue">
          <Globe size={32} />
        </div>
        <h1 className="text-3xl font-bold">Risk</h1>
        <p className="text-text-secondary">The classic game of world domination.</p>
      </header>

      <Card className="space-y-4 p-5">
        <p className="font-medium">
          The war room is still being built. <span className="text-brand-orange">Check back soon.</span>
        </p>
        <ol className="space-y-2 text-sm text-text-secondary">
          {PLAN.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="shrink-0 font-bold text-brand-pink">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
