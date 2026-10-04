// Add a game: a name (looked up on the Steam store) or a literal appid.
//
// docs: docs/managing.md

import { useKeyboard } from "@opentui/react";
import { useState } from "react";

import { theme } from "../../theme.ts";

/** Values collected by the wizard. */
export interface AddValues {
  name: string;
  appid?: number;
  depot?: number;
  exe?: string;
  /** Optional runtime override (`gptk`, `gptk-apple`, `wine-devel`, ...). */
  runtime?: string;
}

export interface AddWizardProps {
  onSubmit: (values: AddValues) => void;
  onCancel: () => void;
  busy: boolean;
}

type Field = "name" | "appid" | "depot" | "exe" | "runtime";

/** The tab order of the form fields. */
const ORDER: Field[] = ["name", "appid", "depot", "exe", "runtime"];

/** Render the add-game form. */
export function AddWizard({ onSubmit, onCancel, busy }: AddWizardProps) {
  const [name, setName] = useState("");
  const [appid, setAppid] = useState("");
  const [depot, setDepot] = useState("");
  const [exe, setExe] = useState("");
  const [runtime, setRuntime] = useState("");
  const [field, setField] = useState<Field>("name");

  const submit = () =>
    onSubmit({
      name: name.trim(),
      appid: Number.parseInt(appid, 10) || undefined,
      depot: Number.parseInt(depot, 10) || undefined,
      exe: exe.trim() || undefined,
      runtime: runtime.trim() || undefined,
    });

  useKeyboard((key) => {
    if (busy) {
      return;
    }
    if (key.name === "tab") {
      setField((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);
      return;
    }
    if (key.name === "escape") {
      onCancel();
      return;
    }
    if (key.name === "return") {
      submit();
    }
  });

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <text fg={theme.strong}>Add a game</text>
      <text fg={theme.muted}>Give a name to look up on the Steam store, or an appid directly.</text>

      <Field label="Name" focused={field === "name"}>
        <input placeholder="Graveyard Keeper 2" focused={field === "name"} onInput={setName} onSubmit={() => setField("appid")} />
      </Field>

      <Field label="Appid" focused={field === "appid"}>
        <input placeholder="4358690" focused={field === "appid"} onInput={setAppid} onSubmit={() => setField("depot")} />
      </Field>

      <Field label="Depot" focused={field === "depot"}>
        <input placeholder="4358691" focused={field === "depot"} onInput={setDepot} onSubmit={() => setField("exe")} />
      </Field>

      <Field label="Exe" focused={field === "exe"}>
        <input placeholder="GraveyardKeeper2.exe" focused={field === "exe"} onInput={setExe} onSubmit={() => setField("runtime")} />
      </Field>

      <Field label="Runtime" focused={field === "runtime"}>
        <input placeholder="gptk-apple" focused={field === "runtime"} onInput={setRuntime} onSubmit={submit} />
      </Field>

      {exe.trim() === "" ? (
        <text fg={theme.warning}>No exe set — the engine detects it after import.</text>
      ) : null}

      {runtime.trim() === "" ? (
        <text fg={theme.muted}>Runtime empty — uses the catalog default (or gptk).</text>
      ) : null}

      <text fg={theme.muted}>tab next · enter add · esc cancel</text>
    </box>
  );
}

function Field({ label, focused, children }: { label: string; focused: boolean; children: React.ReactNode }) {
  return (
    <box
      title={` ${label} `}
      titleColor={focused ? theme.accent : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderActive : theme.border}
      style={{ width: 52, height: 3 }}
    >
      {children}
    </box>
  );
}
