/** The shared money grammar for the whole Monopoly UI: a signed dollar figure
 *  colored from the VIEWER's vantage — green for cash that came to me, red for
 *  cash that left me, plain white for money that moved but never touched my
 *  balance (the sign still shows the flow direction). Used by the event log and
 *  the trade panel so every dollar amount in the game reads the same way. */
export function Money({
  amount,
  sign,
  mine,
}: {
  amount: number;
  sign?: "+" | "-";
  /** Did this money move the viewer's own balance? Green/red when it did, plain
   *  white when it's someone else's money. */
  mine: boolean;
}) {
  const color = !mine
    ? "var(--mono-ink)"
    : sign === "+"
      ? "var(--mono-green)"
      : "var(--mono-red)";
  const prefix = sign === "+" ? "+" : sign === "-" ? "−" : "";
  return (
    <span
      style={{
        color,
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
      }}
    >
      {prefix}${amount.toLocaleString("en-US")}
    </span>
  );
}
