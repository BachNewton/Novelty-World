interface ScoreDisplayProps {
  score: number;
  highScore: number;
}

export function ScoreDisplay({ score, highScore }: ScoreDisplayProps) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-sm font-medium">
        Score: <span className="text-brand-orange">{score}</span>
      </span>
      <span className="text-xs text-text-muted">
        Best: {highScore}
      </span>
    </div>
  );
}
