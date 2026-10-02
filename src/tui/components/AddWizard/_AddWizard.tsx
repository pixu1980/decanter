// Add a game: a name (looked up on the Steam store) or a literal appid.
//
// docs: docs/managing.md

import { useKeyboard } from "@opentui/react";
import { useState } from "react";

/** Values collected by the wizard. */
export interface AddValues {
  name: string;
  appid?: number;
  depot?: number;
}

export interface AddWizardProps {
  onSubmit: (values: AddValues) => void;
  onCancel: () => void;
  busy: boolean;
}

type Field = "name" | "appid" | "depot";

/** Render the add-game form. */
export function AddWizard({ onSubmit, onCancel, busy }: AddWizardProps) {
  const [name, setName] = useState("");
  const [appid, setAppid] = useState("");
  const [depot, setDepot] = useState("");
  const [field, setField] = useState<Field>("name");

  const submit = () =>
    onSubmit({
      name: name.trim(),
      appid: Number.parseInt(appid, 10) || undefined,
      depot: Number.parseInt(depot, 10) || undefined,
    });

  useKeyboard((key) => {
    if (busy) {
      return;
    }
    if (key.name === "tab") {
      setField((current) => (current === "name" ? "appid" : current === "appid" ? "depot" : "name"));
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
      <text fg="#ffffff">Add a game</text>
      <text fg="#6b7280">Give a name to look up on the Steam store, or an appid directly.</text>

      <Field label="Name" focused={field === "name"}>
        <input placeholder="Graveyard Keeper 2" focused={field === "name"} onInput={setName} onSubmit={() => setField("appid")} />
      </Field>

      <Field label="Appid" focused={field === "appid"}>
        <input placeholder="4358690" focused={field === "appid"} onInput={setAppid} onSubmit={() => setField("depot")} />
      </Field>

      <Field label="Depot" focused={field === "depot"}>
        <input placeholder="4358691" focused={field === "depot"} onInput={setDepot} onSubmit={submit} />
      </Field>

      <text fg="#6b7280">tab next · enter add · esc cancel</text>
    </box>
  );
}

function Field({ label, focused, children }: { label: string; focused: boolean; children: React.ReactNode }) {
  return (
    <box title={label} style={{ border: true, borderColor: focused ? "#61afef" : "#3c4048", width: 48, height: 3 }}>
      {children}
    </box>
  );
}
