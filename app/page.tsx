"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Character = {
  id: string;
  name: string;
  prompt: string;
  activePromptVersion: string;
  generatedPromptVersion: string | null;
  canonicalPromptVersion: string | null;
  notes: string;
  referenceImage: string | null;
  generatedImage: string | null;
  canonicalImage: string | null;
  approved: boolean;
};

type LoopState = "IMPORT" | "IMPORTED" | "REVIEW" | "APPROVED";

function localDateTimeValue(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function currentState(character: Character | undefined): LoopState {
  if (!character?.referenceImage) return "IMPORT";
  if (character.approved) return "APPROVED";
  if (character.generatedImage) return "REVIEW";
  return "IMPORTED";
}

function ImagePane({
  label,
  src,
  empty,
  badge
}: {
  label: string;
  src: string | null;
  empty: string;
  badge?: string | null;
}) {
  return (
    <section className="grid min-h-0 grid-rows-[38px_1fr] border-r border-[var(--line)] last:border-r-0">
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[#0c0e12] px-4">
        <span className="text-xs font-black uppercase text-[var(--muted)]">{label}</span>
        {badge ? <span className="text-xs font-black uppercase text-[var(--active)]">{badge}</span> : null}
      </div>
      <div className="min-h-0 bg-black">
        {src ? (
          <img src={src} alt={label} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm font-bold uppercase text-[var(--muted)]">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [activePromptVersion, setActivePromptVersion] = useState("P-E3B0C442");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleStart, setScheduleStart] = useState("");
  const [schedulePrompts, setSchedulePrompts] = useState(["", "", "", "", "", ""]);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const sourceInput = useRef<HTMLInputElement>(null);
  const resultInput = useRef<HTMLInputElement>(null);
  const scheduleRef1 = useRef<HTMLInputElement>(null);
  const scheduleRef2 = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => characters.find((character) => character.id === selectedId) ?? characters[0],
    [characters, selectedId]
  );
  const state = currentState(selected);
  const promptMatchesGenerated =
    Boolean(selected?.generatedPromptVersion) && selected?.generatedPromptVersion === activePromptVersion;
  const canApprove = Boolean(selected?.generatedImage && prompt.trim() && promptMatchesGenerated && state !== "APPROVED");
  const approvalLocked = state === "APPROVED";

  useEffect(() => {
    fetch("/api/characters")
      .then((response) => response.json())
      .then((data: { characters: Character[] }) => {
        setCharacters(data.characters);
        setSelectedId(data.characters[0]?.id ?? "");
      });
  }, []);

  useEffect(() => {
    const start = new Date(Date.now() + 10 * 60 * 1000);
    start.setSeconds(0, 0);
    setScheduleStart(localDateTimeValue(start));
  }, []);

  useEffect(() => {
    setPrompt(selected?.prompt ?? "");
    setNotes(selected?.notes ?? "");
  }, [selected?.id, selected?.notes, selected?.prompt]);

  useEffect(() => {
    let active = true;

    async function setVersion() {
      const data = new TextEncoder().encode(prompt.trim());
      const hash = await crypto.subtle.digest("SHA-256", data);
      const hex = Array.from(new Uint8Array(hash))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 8)
        .toUpperCase();
      if (active) setActivePromptVersion(`P-${hex}`);
    }

    setVersion();
    return () => {
      active = false;
    };
  }, [prompt]);

  function updateCharacter(character: Character) {
    setCharacters((current) => current.map((item) => (item.id === character.id ? character : item)));
  }

  async function saveText() {
    if (!selected) return null;
    const response = await fetch(`/api/characters/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, notes })
    });
    const data = (await response.json()) as { character: Character };
    updateCharacter(data.character);
    return data.character;
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>, target: "references" | "generated") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selected) return;

    setBusy(true);
    if (target === "generated") {
      await saveText();
    }
    const formData = new FormData();
    formData.append("target", target);
    formData.append("file", file);
    const response = await fetch(`/api/characters/${selected.id}/assets`, {
      method: "POST",
      body: formData
    });
    const data = (await response.json()) as { character?: Character };
    if (data.character) updateCharacter(data.character);
    setBusy(false);
  }

  async function generatePrompt() {
    if (!selected) return;
    const nextPrompt =
      prompt.trim() ||
      `${selected.name} as a canonical Identity Forge character. Preserve the source face, silhouette, age, cultural context, and recognizable identity. Produce a cinematic full-color character portrait suitable for direct comparison against the imported source image.`;
    setPrompt(nextPrompt);
    setBusy(true);
    const response = await fetch(`/api/characters/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: nextPrompt, notes })
    });
    const data = (await response.json()) as { character: Character };
    updateCharacter(data.character);
    setBusy(false);
  }

  async function launchImage2() {
    const saved = await saveText();
    const text = encodeURIComponent(saved?.prompt ?? prompt);
    window.open(`https://chatgpt.com/?q=${text}`, "_blank", "noopener,noreferrer");
  }

  async function approve() {
    if (!selected) return;
    setBusy(true);
    await saveText();
    const response = await fetch(`/api/characters/${selected.id}/approve`, { method: "POST" });
    const data = (await response.json()) as { character?: Character };
        if (data.character) {
      const nextCharacters = characters.map((character) =>
        character.id === selected.id ? data.character! : character
      );
      setCharacters(nextCharacters);
    }
    setBusy(false);
  }

  async function scheduleBatch() {
    if (!selected || !scheduleRef1.current?.files?.[0] || !scheduleRef2.current?.files?.[0]) {
      setScheduleMessage("Add 2 reference images.");
      return;
    }

    const prompts = schedulePrompts.map((item) => item.trim());
    if (prompts.filter(Boolean).length === 0) {
      setScheduleMessage("Add at least 1 prompt.");
      return;
    }

    setBusy(true);
    setScheduleMessage("");
    const formData = new FormData();
    formData.append("startAt", scheduleStart);
    formData.append("reference_1", scheduleRef1.current.files[0]);
    formData.append("reference_2", scheduleRef2.current.files[0]);
    prompts.forEach((item, index) => formData.append(`prompt_${index}`, item));

    const response = await fetch(`/api/characters/${selected.id}/schedule`, {
      method: "POST",
      body: formData
    });
    const data = (await response.json()) as { schedule?: { rounds: unknown[] }; error?: string };

    if (data.schedule) {
      setScheduleMessage(`Scheduled ${data.schedule.rounds.length} rounds.`);
      setSchedulePrompts(["", "", "", "", "", ""]);
      if (scheduleRef1.current) scheduleRef1.current.value = "";
      if (scheduleRef2.current) scheduleRef2.current.value = "";
    } else {
      setScheduleMessage(data.error ?? "Schedule failed.");
    }
    setBusy(false);
  }

  return (
    <main className="grid h-screen grid-cols-[210px_1fr_330px] overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      <aside className="grid min-h-0 grid-rows-[124px_1fr_74px] border-r border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="text-xs font-black uppercase text-[var(--muted)]">Identity Forge</div>
          <div className="mt-1 text-lg font-black">Loop UI</div>
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            disabled={!selected || busy}
            className="mt-3 h-9 w-full border border-[var(--line)] bg-[var(--field)] text-xs font-black uppercase text-white disabled:opacity-40"
          >
            Schedule
          </button>
        </div>

        <nav className="min-h-0 overflow-auto py-2">
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              onClick={() => setSelectedId(character.id)}
              className={`flex h-12 w-full items-center justify-between px-5 text-left text-sm font-bold ${
                character.id === selected?.id ? "bg-[var(--active)] text-black" : "text-[#d4d7dd] hover:bg-[var(--panel-2)]"
              }`}
            >
              <span>{character.name}</span>
              <span className="text-[10px] uppercase opacity-70">{currentState(character)}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          <input
            ref={sourceInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => uploadImage(event, "references")}
          />
          <button
            type="button"
            onClick={() => sourceInput.current?.click()}
            disabled={!selected || busy}
            className="h-11 w-full bg-white text-sm font-black uppercase text-black disabled:opacity-40"
          >
            Import Character
          </button>
        </div>
      </aside>

      <section className="grid min-w-0 grid-rows-[50px_1fr] bg-black">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[#08090b] px-5">
          <div className="text-sm font-black uppercase text-[var(--muted)]">Import → Generate → Compare → Approve</div>
          <div className="text-sm font-black uppercase text-[var(--active)]">{state}</div>
        </div>

        {selected?.generatedImage || selected?.approved ? (
          <div className="grid min-h-0 grid-cols-2">
            <ImagePane label="Source" src={selected.referenceImage} empty="Import source image" />
            <ImagePane
              label={selected.approved ? "Canonical" : "Generated"}
              src={selected.canonicalImage ?? selected.generatedImage}
              empty="Ingest generated result"
              badge={selected.canonicalPromptVersion ?? selected.generatedPromptVersion ?? "No prompt binding"}
            />
          </div>
        ) : (
          <div className="min-h-0">
            <ImagePane label="Source" src={selected?.referenceImage ?? null} empty="Import source image" />
          </div>
        )}
      </section>

      <aside className="grid min-h-0 grid-rows-[1fr_252px] border-l border-[var(--line)] bg-[var(--panel)]">
        <section className="min-h-0 overflow-auto p-5">
          <h1 className="text-2xl font-black">{selected?.name ?? "Character"}</h1>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="border border-[var(--line)] bg-[var(--field)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">Active Prompt</div>
              <div className="mt-1 text-sm font-black text-[var(--active)]">
                {activePromptVersion}
              </div>
            </div>
            <div className="border border-[var(--line)] bg-[var(--field)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--muted)]">Generated From</div>
              <div className={`mt-1 text-sm font-black ${promptMatchesGenerated || approvalLocked ? "text-[var(--active)]" : "text-[#f2b35e]"}`}>
                {selected?.canonicalPromptVersion ?? selected?.generatedPromptVersion ?? "Not Bound"}
              </div>
            </div>
          </div>

          {approvalLocked ? (
            <div className="mt-4 border border-[var(--approved)] bg-[#092116] p-3 text-sm font-black uppercase text-[var(--active)]">
              Approved canonical image
              <br />
              Winning prompt saved
            </div>
          ) : !promptMatchesGenerated && selected?.generatedImage ? (
            <div className="mt-4 border border-[#6c4b22] bg-[#1c1409] p-3 text-xs font-black uppercase leading-5 text-[#f2b35e]">
              Generated image is not tied to the active prompt. Ingest result again after prompt changes.
            </div>
          ) : null}

          <label className="mt-5 block text-xs font-black uppercase text-[var(--muted)]">Prompt</label>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-2 h-56 w-full resize-none border border-[var(--line)] bg-[var(--field)] p-3 text-sm leading-6 text-white outline-none focus:border-[var(--active)]"
          />

          <label className="mt-5 block text-xs font-black uppercase text-[var(--muted)]">Notes</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 h-36 w-full resize-none border border-[var(--line)] bg-[var(--field)] p-3 text-sm leading-6 text-white outline-none focus:border-[var(--active)]"
          />
        </section>

        <section className="border-t border-[var(--line)] p-5">
          <input
            ref={resultInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => uploadImage(event, "generated")}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={generatePrompt}
              disabled={!selected?.referenceImage || busy || state === "APPROVED"}
              className="h-11 bg-[var(--panel-2)] text-xs font-black uppercase text-white disabled:opacity-35"
            >
              Generate Prompt
            </button>
            <button
              type="button"
              onClick={launchImage2}
              disabled={!selected?.referenceImage || !prompt.trim() || busy || state === "APPROVED"}
              className="h-11 bg-white text-xs font-black uppercase text-black disabled:opacity-35"
            >
              Launch Image 2
            </button>
            <button
              type="button"
              onClick={() => resultInput.current?.click()}
              disabled={!selected?.referenceImage || busy || state === "APPROVED"}
              className="h-11 bg-[var(--panel-2)] text-xs font-black uppercase text-white disabled:opacity-35"
            >
              Ingest Result
            </button>
            <button
              type="button"
              onClick={launchImage2}
              disabled={!selected?.generatedImage || busy || state === "APPROVED"}
              className="h-11 bg-[var(--panel-2)] text-xs font-black uppercase text-white disabled:opacity-35"
            >
              Regenerate
            </button>
          </div>
          <button
            type="button"
            onClick={approve}
            disabled={!canApprove || busy}
            className="mt-3 h-16 w-full bg-[var(--approved)] text-base font-black uppercase tracking-wide text-white disabled:bg-[#30343b] disabled:text-[var(--muted)]"
          >
            Lock Image + Active Prompt
          </button>
          <button
            type="button"
            onClick={() => {
              const currentIndex = characters.findIndex((character) => character.id === selected?.id);
              setSelectedId(characters[currentIndex + 1]?.id ?? characters[0]?.id ?? "");
            }}
            disabled={state !== "APPROVED"}
            className="mt-3 h-10 w-full border border-[var(--line)] text-xs font-black uppercase text-[var(--muted)] disabled:opacity-35"
          >
            Next Character
          </button>
        </section>
      </aside>

      {scheduleOpen ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/75 p-6">
          <section className="grid max-h-[92vh] w-full max-w-3xl grid-rows-[auto_1fr_auto] border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-xs font-black uppercase text-[var(--muted)]">Batch Schedule</div>
                <h2 className="text-xl font-black">{selected?.name ?? "Character"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="h-9 border border-[var(--line)] px-3 text-xs font-black uppercase text-[var(--muted)]"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 overflow-auto p-5">
              <div className="grid grid-cols-3 gap-3">
                <label className="block border border-[var(--line)] bg-[var(--field)] p-3">
                  <span className="block text-[10px] font-black uppercase text-[var(--muted)]">Reference 1</span>
                  <input ref={scheduleRef1} type="file" accept="image/*" className="mt-3 w-full text-xs text-[var(--muted)]" />
                </label>
                <label className="block border border-[var(--line)] bg-[var(--field)] p-3">
                  <span className="block text-[10px] font-black uppercase text-[var(--muted)]">Reference 2</span>
                  <input ref={scheduleRef2} type="file" accept="image/*" className="mt-3 w-full text-xs text-[var(--muted)]" />
                </label>
                <label className="block border border-[var(--line)] bg-[var(--field)] p-3">
                  <span className="block text-[10px] font-black uppercase text-[var(--muted)]">Start Time</span>
                  <input
                    type="datetime-local"
                    value={scheduleStart}
                    onChange={(event) => setScheduleStart(event.target.value)}
                    className="mt-3 h-9 w-full border border-[var(--line)] bg-black px-2 text-sm text-white outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {schedulePrompts.map((item, index) => (
                  <label key={index} className="block">
                    <span className="text-[10px] font-black uppercase text-[var(--muted)]">
                      Prompt {index + 1}
                    </span>
                    <textarea
                      value={item}
                      onChange={(event) =>
                        setSchedulePrompts((current) =>
                          current.map((promptItem, promptIndex) =>
                            promptIndex === index ? event.target.value : promptItem
                          )
                        )
                      }
                      className="mt-1 h-24 w-full resize-none border border-[var(--line)] bg-[var(--field)] p-3 text-sm leading-5 text-white outline-none focus:border-[var(--active)]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-4">
              <div className="text-xs font-black uppercase text-[var(--muted)]">
                {scheduleMessage || "Maximum 6 rounds. Runs every 10 minutes."}
              </div>
              <button
                type="button"
                onClick={scheduleBatch}
                disabled={busy}
                className="h-11 bg-white px-5 text-sm font-black uppercase text-black disabled:opacity-40"
              >
                Schedule Batch
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
