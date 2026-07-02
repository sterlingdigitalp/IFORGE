"use client";

import { useEffect, useMemo, useState } from "react";

type Character = {
  id: string;
  name: string;
  prompt: string;
  notes: string;
  referenceImage: string | null;
  generatedImage: string | null;
  approved: boolean;
};

function ImageStage({
  label,
  src,
  dominant = false
}: {
  label: string;
  src: string | null;
  dominant?: boolean;
}) {
  return (
    <section className="min-h-0 border-r border-[var(--line)] last:border-r-0">
      <div className="flex h-9 items-center border-b border-[var(--line)] bg-[var(--panel)] px-4 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className={dominant ? "h-[calc(100%-2.25rem)] bg-white" : "h-64 bg-white"}>
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">No image</div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? characters[0],
    [characters, selectedId]
  );

  const approvedCount = characters.filter((character) => character.approved).length;

  useEffect(() => {
    fetch("/api/characters")
      .then((response) => response.json())
      .then((data: { characters: Character[] }) => {
        setCharacters(data.characters);
        setSelectedId(data.characters[0]?.id ?? "");
      });
  }, []);

  useEffect(() => {
    setPrompt(selected?.prompt ?? "");
    setNotes(selected?.notes ?? "");
  }, [selected?.id, selected?.notes, selected?.prompt]);

  async function saveText() {
    if (!selected) return;
    setSaving(true);
    const response = await fetch(`/api/characters/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, notes })
    });
    const data = (await response.json()) as { character: Character };
    setCharacters((current) =>
      current.map((character) => (character.id === selected.id ? data.character : character))
    );
    setSaving(false);
  }

  function openChatGPT() {
    const text = encodeURIComponent(prompt);
    window.open(`https://chatgpt.com/?q=${text}`, "_blank", "noopener,noreferrer");
  }

  async function approve() {
    if (!selected) return;
    await saveText();
    const response = await fetch(`/api/characters/${selected.id}/approve`, { method: "POST" });
    const data = (await response.json()) as { character?: Character; error?: string };
    if (!data.character) return;

    const nextCharacters = characters.map((character) =>
      character.id === selected.id ? data.character! : character
    );
    setCharacters(nextCharacters);

    const currentIndex = nextCharacters.findIndex((character) => character.id === selected.id);
    const next =
      nextCharacters.slice(currentIndex + 1).find((character) => !character.approved) ??
      nextCharacters.find((character) => !character.approved) ??
      nextCharacters[currentIndex + 1] ??
      nextCharacters[0];
    setSelectedId(next?.id ?? "");
  }

  return (
    <main className="grid h-screen grid-cols-[190px_1fr_320px] overflow-hidden">
      <aside className="border-r border-[var(--line)] bg-[#ebe5dc]">
        <div className="border-b border-[var(--line)] px-5 py-5">
          <div className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Progress</div>
          <div className="mt-2 text-3xl font-bold">{approvedCount} / 100</div>
        </div>
        <nav className="py-3">
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => setSelectedId(character.id)}
              className={`flex h-12 w-full items-center justify-between px-5 text-left text-base ${
                character.id === selected?.id ? "bg-[var(--panel)] font-bold" : "text-[#36322d]"
              }`}
            >
              <span>{character.name}</span>
              {character.approved ? <span className="text-[var(--approved)]">Done</span> : null}
            </button>
          ))}
        </nav>
      </aside>

      <section className="grid min-w-0 grid-rows-[285px_1fr]">
        <ImageStage label="Reference Viewer" src={selected?.referenceImage ?? null} />

        <section className="min-h-0">
          <div className="grid h-full grid-cols-2">
            <ImageStage label="Reference" src={selected?.referenceImage ?? null} dominant />
            <ImageStage label="Generated" src={selected?.generatedImage ?? null} dominant />
          </div>
        </section>
      </section>

      <aside className="grid min-h-0 grid-rows-[1fr_150px] border-l border-[var(--line)] bg-[var(--panel)]">
        <section className="min-h-0 p-5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{selected?.name ?? "Identity Forge"}</h1>
            <button
              type="button"
              onClick={saveText}
              disabled={saving || !selected}
              className="border border-[var(--line)] px-3 py-2 text-sm font-bold disabled:opacity-50"
            >
              {saving ? "Saving" : "Save"}
            </button>
          </div>

          <label className="mt-6 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            Generated Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-2 h-52 w-full resize-none border border-[var(--line)] bg-white p-3 text-sm leading-6 outline-none focus:border-[#94846f]"
          />

          <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 h-32 w-full resize-none border border-[var(--line)] bg-white p-3 text-sm leading-6 outline-none focus:border-[#94846f]"
          />

          <button
            type="button"
            onClick={openChatGPT}
            disabled={!selected}
            className="mt-5 w-full border border-[#161616] bg-[#161616] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Launch ChatGPT
          </button>
        </section>

        <section className="border-t border-[var(--line)] p-5">
          <button
            type="button"
            onClick={approve}
            disabled={!selected || !selected.generatedImage}
            className="h-20 w-full bg-[var(--approved)] text-2xl font-black tracking-wide text-white disabled:bg-[#aaa39a]"
          >
            APPROVE
          </button>
          <div className="mt-4 text-center text-sm font-bold text-[var(--muted)]">Next Character</div>
        </section>
      </aside>
    </main>
  );
}
