import { keccak256 } from "viem";

// 32 × 32 words; adjective + animal, never a real name.
const ADJ = [
  "Blue", "Red", "Quiet", "Lucky", "Brave", "Sunny", "Swift", "Mellow",
  "Golden", "Velvet", "Crisp", "Dusty", "Mossy", "Rusty", "Silver", "Spicy",
  "Sleepy", "Witty", "Bold", "Fuzzy", "Jolly", "Minty", "Peachy", "Rapid",
  "Salty", "Shiny", "Snowy", "Stormy", "Tidy", "Wild", "Zesty", "Cosy",
];
const ANIMAL = [
  "Otter", "Fox", "Heron", "Koala", "Lynx", "Panda", "Gecko", "Bison",
  "Crane", "Dingo", "Egret", "Ferret", "Gibbon", "Hare", "Ibis", "Jackal",
  "Kiwi", "Lemur", "Mole", "Newt", "Okapi", "Puffin", "Quail", "Raven",
  "Seal", "Tapir", "Urchin", "Vole", "Walrus", "Yak", "Zebra", "Mongoose",
];

export function nick(address: string): string {
  const h = keccak256(address.toLowerCase() as `0x${string}`);
  const a = parseInt(h.slice(2, 4), 16) % 32;
  const b = parseInt(h.slice(4, 6), 16) % 32;
  return `${ADJ[a]} ${ANIMAL[b]}`;
}
