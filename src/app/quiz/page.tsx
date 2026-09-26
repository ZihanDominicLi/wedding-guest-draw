import { QuizLobby } from "@/components/quiz/QuizLobby";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  return <main className="join-shell"><QuizLobby /></main>;
}
