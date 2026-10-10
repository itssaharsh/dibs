import { Buyer } from "./Buyer";

export default async function Page({ params, searchParams }: PageProps<"/d/[drop]">) {
  const { drop } = await params;
  const sp = await searchParams;
  const state = typeof sp.state === "string" ? sp.state : null;
  return <Buyer drop={drop} fixture={state} />;
}
