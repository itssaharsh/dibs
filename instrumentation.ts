// Boot the chain indexer and the keeper with the server, not on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getIndexer } = await import("./lib/indexer");
  const ix = getIndexer();
  await ix.ready.catch((e) => console.error("indexer boot failed", e));
  const { startKeeper } = await import("./lib/keeper");
  await startKeeper();
}
