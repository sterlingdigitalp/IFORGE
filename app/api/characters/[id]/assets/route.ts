import { NextResponse } from "next/server";
import { writeCharacterImage } from "@/lib/characters";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const target = formData.get("target");
    const file = formData.get("file");

    if ((target !== "references" && target !== "generated") || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing image upload." }, { status: 400 });
    }

    const character = await writeCharacterImage(id, target, file);
    return NextResponse.json({ character });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
