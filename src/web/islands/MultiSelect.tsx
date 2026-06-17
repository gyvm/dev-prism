import { useEffect, useId, useRef, useState } from "react";

type Props = Readonly<{
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}>;

// Lightweight searchable multiselect: a trigger button that opens a panel with
// a filter box and a checkbox list. Closes on outside-click or Escape. No
// dependency — the option sets here are small (repos, actor logins).
export default function MultiSelect({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? options.filter((option) => option.toLowerCase().includes(needle)) : options;

  const toggle = (value: string): void => {
    onChange(selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  return (
    <div className="explore-ms" ref={containerRef}>
      <button
        type="button"
        className="explore-ms__btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        disabled={options.length === 0}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        {selected.length > 0 ? ` · ${selected.length}` : ""}
      </button>
      {open && (
        <div className="explore-ms__panel" id={panelId} role="group" aria-label={label}>
          <input
            className="explore-ms__search"
            type="text"
            placeholder="絞り込み…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {selected.length > 0 && (
            <button type="button" className="explore-ms__clear" onClick={() => onChange([])}>
              選択を解除 ({selected.length})
            </button>
          )}
          <ul className="explore-ms__list">
            {filtered.length === 0 ? (
              <li className="explore-ms__empty">候補なし</li>
            ) : (
              filtered.map((option) => (
                <li key={option}>
                  <label className="explore-ms__opt">
                    <input type="checkbox" checked={selectedSet.has(option)} onChange={() => toggle(option)} />
                    <span>{option}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
