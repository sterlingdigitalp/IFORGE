import { NextResponse } from "next/server";
import { createBatchSchedule } from "@/lib/characters";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const startAt = String(formData.get("startAt") ?? "");
    const prompts = Array.from({ length: 6 }, (_, index) => String(formData.get(`prompt_${index}`) ?? ""));
    const ref1 = formData.get("reference_1");
    const ref2 = formData.get("reference_2");

    if (!(ref1 instanceof File) || !(ref2 instanceof File)) {
      return NextResponse.json({ error: "Schedule requires two reference images." }, { status: 400 });
    }

    const schedule = await createBatchSchedule(id, {
      startAt,
      prompts,
      references: [ref1, ref2]
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Schedule failed." },
      { status: 400 }
    );
  }
}
