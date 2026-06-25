import { resolveScope, type Grain, type Scope } from "../analyses/scope.js";
import { escapeHtml } from "../renderers/utils.js";

// Filter bar: builds controls from the current scope and reports a new scope on
// change. Pure DOM; the page re-runs queries in-memory (no refetch).

function field(label: string, control: string): string {
  return `<label class="explore-field"><span>${label}</span>${control}</label>`;
}

function dateValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function renderFilterControls(form: HTMLFormElement, scope: Scope): void {
  const grainOption = (value: Grain, text: string): string =>
    `<option value="${value}"${scope.grain === value ? " selected" : ""}>${text}</option>`;
  form.innerHTML = [
    field("From", `<input type="date" name="from" value="${dateValue(scope.from)}">`),
    field("To", `<input type="date" name="to" value="${dateValue(scope.to)}">`),
    field("粒度", `<select name="grain">${grainOption("day", "日")}${grainOption("week", "週")}${grainOption("month", "月")}</select>`),
    field("Repos", `<input type="text" name="repos" placeholder="owner/name, …" value="${escapeHtml(scope.repos.join(", "))}">`),
    field("Users", `<input type="text" name="users" placeholder="login, …" value="${escapeHtml(scope.users.join(", "))}">`),
    field("Bot を含む", `<input type="checkbox" name="includeBots"${scope.includeBots ? " checked" : ""}>`),
    `<button type="submit">更新</button>`,
  ].join("");
}

function parseList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Reads the current control values into a Scope. */
export function scopeFromForm(form: HTMLFormElement): Scope {
  const data = new FormData(form);
  const get = (name: string): string => String(data.get(name) ?? "");
  const grain = get("grain");
  const from = get("from");
  const to = get("to");
  return resolveScope({
    from: from ? new Date(`${from}T00:00:00.000Z`) : null,
    to: to ? new Date(`${to}T23:59:59.999Z`) : null,
    repos: parseList(get("repos")),
    users: parseList(get("users")),
    includeBots: data.get("includeBots") !== null,
    ...(grain === "day" || grain === "week" || grain === "month" ? { grain } : {}),
  });
}

/** Wires submit → onChange(newScope). */
export function mountFilters(
  form: HTMLFormElement,
  scope: Scope,
  onChange: (scope: Scope) => void,
): void {
  renderFilterControls(form, scope);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onChange(scopeFromForm(form));
  });
}
