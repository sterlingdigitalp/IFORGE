import { NextResponse } from "next/server";
import { listCharacters } from "@/lib/characters";

export async function GET() {
  return NextResponse.json({ characters: await listCharacters() });
}
