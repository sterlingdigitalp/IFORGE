import { NextResponse } from "next/server";
import { promoteBatchCandidate } from "@/lib/characters";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { batchOutputPath?: string; imagePath?: string; path?: string };
    const promoted = await promoteBatchCandidate(id, body);
    return NextResponse.json({ promoted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Promote failed." },
      { status: 400 }
    );
  }
}
