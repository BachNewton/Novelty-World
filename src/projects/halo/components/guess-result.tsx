import { Check, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

interface GuessResultProps {
  correct: boolean;
  mapName: string;
  sourceGame: string;
  onNext: () => void;
}

export function GuessResult({
  correct,
  mapName,
  sourceGame,
  onNext,
}: GuessResultProps) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 px-4">
      <div className="flex items-center gap-2">
        {correct ? (
          <>
            <Check size={24} className="text-brand-green" />
            <span className="text-lg font-semibold text-brand-green">
              Correct!
            </span>
          </>
        ) : (
          <>
            <X size={24} className="text-brand-pink" />
            <span className="text-lg font-semibold text-brand-pink">
              Wrong!
            </span>
          </>
        )}
      </div>

      {!correct && (
        <p className="text-center text-sm text-text-secondary">
          It was: <span className="font-semibold text-text-primary">{mapName}</span>
        </p>
      )}

      <p className="text-center text-xs text-text-muted">{sourceGame}</p>

      <Button onClick={onNext} className="mt-1 w-full">
        Next
      </Button>
    </div>
  );
}
