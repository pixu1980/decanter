// Add a game: a name (looked up on the store) or a literal id.
//
// The fields follow the store: Steam wants an appid/depot, GOG a product id,
// Epic resolves the name against the owned titles. `slug` and `runtime` always
// apply. The exe is detected after import.
//
// docs: docs/managing.md

import { useKeyboard } from "@opentui/react";
import { useState } from "react";

import { theme } from "../../theme.ts";

/** Values collected by the wizard. */
export interface AddValues {
  name: string;
  /** Which store to resolve the game from. */
  store: "steam" | "gog" | "epic";
  appid?: number;
  depot?: number;
  /** Override the derived slug. */
  slug?: string;
  /** GOG product id, when adding from GOG. */
  gogId?: number;
  /** Optional runtime override (`gptk`, `gptk-apple`, `wine-devel`, ...). */
  runtime?: string;
}

export interface AddWizardProps {
  onSubmit: (values: AddValues) => void;
  onCancel: () => void;
  busy: boolean;
}

type Field = "store" | "name" | "appid" | "depot" | "gogid" | "slug" | "runtime" | "install";

const STORES = [
  { name: "Steam", description: "download with SteamCMD", value: "steam" },
  { name: "GOG", description: "download from GOG (log in first)", value: "gog" },
  { name: "Epic", description: "download from Epic (log in first)", value: "epic" },
];

/** Render the add-game form. */
export function AddWizard({ onSubmit, onCancel, busy }: AddWizardProps) {
  const [store, setStore] = useState<"steam" | "gog" | "epic">("steam");
  const [name, setName] = useState("");
  const [appid, setAppid] = useState("");
  const [depot, setDepot] = useState("");
  const [gogId, setGogId] = useState("");
  const [slug, setSlug] = useState("");
  const [runtime, setRuntime] = useState("");
  const [field, setField] = useState<Field>("store");

  const submit = () =>
    onSubmit({
      name: name.trim(),
      store,
      appid: Number.parseInt(appid, 10) || undefined,
      depot: Number.parseInt(depot, 10) || undefined,
      gogId: Number.parseInt(gogId, 10) || undefined,
      slug: slug.trim() || undefined,
      runtime: runtime.trim() || undefined,
    });

  const fields: Field[] = [
    "store",
    "name",
    ...(store === "steam" ? (["appid", "depot"] as Field[]) : []),
    ...(store === "gog" ? (["gogid"] as Field[]) : []),
    "slug",
    "runtime",
    "install",
  ];

  const advance = (current: Field) => {
    const index = fields.indexOf(current);
    setField(fields[(index + 1) % fields.length] ?? "install");
  };

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

      <box
        title=" Store "
        titleColor={field === "store" ? theme.accent : theme.muted}
        border
        borderStyle="rounded"
        borderColor={field === "store" ? theme.borderActive : theme.border}
        style={{ width: 52, height: 5 }}
      >
        <select
          options={STORES}
          selectedIndex={STORES.findIndex((option) => option.value === store)}
          focused={field === "store"}
          showDescription={false}
          onChange={(_index, option) => setStore((option?.value as "steam" | "gog" | "epic") ?? "steam")}
          style={{ height: 3 }}
        />
      </box>

      <Field label="Name" focused={field === "name"}>
        <input placeholder="Graveyard Keeper 2" focused={field === "name"} onInput={setName} onSubmit={() => advance("name")} />
      </Field>

      {store === "steam" ? (
        <>
          <Field label="Appid" focused={field === "appid"}>
            <input placeholder="4358690" focused={field === "appid"} onInput={setAppid} onSubmit={() => advance("appid")} />
          </Field>
          <Field label="Depot" focused={field === "depot"}>
            <input placeholder="4358691" focused={field === "depot"} onInput={setDepot} onSubmit={() => advance("depot")} />
          </Field>
        </>
      ) : null}

      {store === "gog" ? (
        <Field label="GOG id" focused={field === "gogid"}>
          <input placeholder="1207659163" focused={field === "gogid"} onInput={setGogId} onSubmit={() => advance("gogid")} />
        </Field>
      ) : null}

      <Field label="Slug" focused={field === "slug"}>
        <input placeholder="graveyard-keeper-2" focused={field === "slug"} onInput={setSlug} onSubmit={() => advance("slug")} />
      </Field>

      <Field label="Runtime" focused={field === "runtime"}>
        <input placeholder="gptk-apple" focused={field === "runtime"} onInput={setRuntime} onSubmit={() => advance("runtime")} />
      </Field>

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

/** A titled, bordered input, the same look as the settings fields. */
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
