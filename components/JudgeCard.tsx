export function JudgeCard() {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 rounded-[14px] bg-surface-1 p-5 text-[17px]">
      <li><b>1</b> Open the board, then the drop on your phone (QR). Tap Dibs.</li>
      <li><b>2</b> If you get first dibs, don&apos;t pay. Your deposit pays the seller and the piece moves on.</li>
      <li><b>3</b> Start a new drop: your phone now asks for a 100 deposit; a buyer who paid asks for 25.</li>
      <li><b>4</b> Run the bot round: 100 wallets ghost, pay the seller, and now pay 2× at every Dibs store.</li>
    </ol>
  );
}
