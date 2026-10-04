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

type Field = "name" | "appid" | "depot" | "exe" | "runtime" | "install";

/** The tab order: the form fields, then the Install button. */
const ORDER: Field[] = ["name", "appid", "depot", "exe", "runtime", "install"];

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

  const advance = (current: Field) => setField(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);

  useKeyboard((key) => {
    if (busy) {
      return;
    }
    if (key.name === "tab") {
      advance(field);
      return;
    }
    if (key.name === "escape") {
      onCancel();
      return;
    }
    // Enter confirms only on the Install button; inside a text field it moves on.
    if ((key.name === "return" || key.name === "space") && field === "install") {
      submit();
    }
  });

  return (
    <box style={{ flexDirection: "column", gap: 1 }}>
      <text fg={theme.strong}>Add a game</text>
      <text fg={theme.muted}>Give a name to look up on the Steam store, or an appid directly.</text>

      <Field label="Name" focused={field === "name"}>
        <input placeholder="Graveyard Keeper 2" focused={field === "name"} onInput={setName} onSubmit={() => advance("name")} />
      </Field>

      <Field label="Appid" focused={field === "appid"}>
        <input placeholder="4358690" focused={field === "appid"} onInput={setAppid} onSubmit={() => advance("appid")} />
      </Field>

      <Field label="Depot" focused={field === "depot"}>
        <input placeholder="4358691" focused={field === "depot"} onInput={setDepot} onSubmit={() => advance("depot")} />
      </Field>

      <Field label="Exe" focused={field === "exe"}>
        <input placeholder="GraveyardKeeper2.exe" focused={field === "exe"} onInput={setExe} onSubmit={() => advance("exe")} />
      </Field>

      <Field label="Runtime" focused={field === "runtime"}>
        <input placeholder="gptk-apple" focused={field === "runtime"} onInput={setRuntime} onSubmit={() => advance("runtime")} />
      </Field>

      {exe.trim() === "" ? (
        <text fg={theme.warning}>No exe set — the engine detects it after import.</text>
      ) : null}

      <InstallButton focused={field === "install"} busy={busy} />

      <text fg={theme.muted}>tab next · enter on Install · esc cancel</text>
    </box>
  );
}

/** The confirmation button: Enter (or space) here starts the install. */
function InstallButton({ focused, busy }: { focused: boolean; busy: boolean }) {
  return (
    <box
      title=" Action "
      titleColor={focused ? theme.accent : theme.muted}
      border
      borderStyle="rounded"
      borderColor={focused ? theme.borderActive : theme.border}
      style={{ width: 52, height: 3, alignItems: "center", justifyContent: "center" }}
    >
      <text fg={focused ? theme.strong : theme.text}>{busy ? "[ Installing… ]" : "[ Install ]"}</text>
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
