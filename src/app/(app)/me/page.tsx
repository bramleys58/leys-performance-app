import { AthleteHome } from "@/components/athlete-home";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "My training | Leys Performance" };

// A coach's own training: the same Today screen an athlete sees.
export default async function MyTrainingPage({ searchParams }: PageProps<"/me">) {
  const sp = await searchParams;
  const user = await requireUser();
  return <AthleteHome firstName={user.fullName.split(" ")[0]} isCoach={user.role === "coach"} done={typeof sp.done === "string" ? sp.done : undefined} />;
}
