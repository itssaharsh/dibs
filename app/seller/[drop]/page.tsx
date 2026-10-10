import { Seller } from "./Seller";

export default async function Page({ params }: PageProps<"/seller/[drop]">) {
  const { drop } = await params;
  return <Seller drop={drop} />;
}
