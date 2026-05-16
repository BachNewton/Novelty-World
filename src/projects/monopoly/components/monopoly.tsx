import { MOCK_STATE } from "../mocks";
import { MONOPOLY_THEME } from "../theme";
import { Footer } from "./footer";
import { Header } from "./header";
import { Squares } from "./squares";

export function Monopoly() {
  return (
    <div
      className="flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{ ...MONOPOLY_THEME, backgroundColor: "var(--mono-frame)" }}
    >
      <Header state={MOCK_STATE} />
      <Squares state={MOCK_STATE} />
      <Footer />
    </div>
  );
}
