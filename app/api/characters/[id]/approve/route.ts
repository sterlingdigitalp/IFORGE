import { NextResponse } from "next/server";
import { approveCharacter } from "@/lib/characters";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { character, warnings } = await approveCharacter(id);
    return NextResponse.json({ character, warnings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed." },
      { status: 400 }
    );
  }
}
