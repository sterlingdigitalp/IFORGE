import { NextResponse } from "next/server";
import { getCharacter, updateCharacterText } from "@/lib/characters";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const character = await getCharacter(id);
  return character ? NextResponse.json({ character }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { prompt?: string; notes?: string };
  const character = await updateCharacterText(id, {
    prompt: body.prompt ?? "",
    notes: body.notes ?? ""
  });

  return character ? NextResponse.json({ character }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
