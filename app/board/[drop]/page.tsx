import { Board } from "./Board";

export default async function Page({ params, searchParams }: PageProps<"/board/[drop]">) {
  const { drop } = await params;
  const sp = await searchParams;
  return <Board drop={drop} fixture={typeof sp.state === "string" ? sp.state : null} />;
}
