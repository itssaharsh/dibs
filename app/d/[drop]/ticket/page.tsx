import { Ticket } from "./Ticket";

export default async function Page({ params }: PageProps<"/d/[drop]/ticket">) {
  const { drop } = await params;
  return <Ticket drop={drop} />;
}
