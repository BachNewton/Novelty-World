import { serveGames } from "@/shared/lib/bot-lab/serve";
import { recordTeacherGame } from "./distill";

// The worker side of the teacher recorder's pool (`risk:record -- --teacher`): its games, served
// through the shared `serveGames` as the measuring runs' are.
serveGames(recordTeacherGame);
