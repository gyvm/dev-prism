import type { PrTimeline, TimelineAuxiliary } from "../shared/types.js";
import { escapeHtml } from "./utils.js";

type GanttData = {
  weekStart: string;
  weekEnd: string;
  timezone?: string;
  timelines: readonly PrTimeline[];
};

const TIMELINE_STATE_LABELS = {
  implementing: "実装中",
  wait_review: "レビュー待ち",
  fixing: "レビュー修正中",
  wait_merge: "マージ待ち",
} as const satisfies Record<PrTimeline["segments"][number]["state"], string>;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function formatDayLabel(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
  return `${minutes}分 (${parts.join("")})`;
}

function formatTimelinePoint(
  value: string,
  timezone: string,
): Readonly<{ date: string; time: string }> {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    date: `${part("month")}/${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function formatTimelineDateTime(value: string, timezone: string): string {
  const point = formatTimelinePoint(value, timezone);
  return `${point.date} ${point.time}`;
}

function buildStatusRow(
  aux: TimelineAuxiliary,
  timezone: string,
): readonly [string, string] {
  const fmt = (value: string): string => formatTimelineDateTime(value, timezone);
  if (aux.closingState === "merged" && aux.mergedAt !== null) {
    return ["状態", `マージ済み (${fmt(aux.mergedAt)})`];
  }
  if (aux.closingState === "closed_unmerged" && aux.closedAt !== null) {
    return ["状態", `クローズ ${fmt(aux.closedAt)} ※未マージ`];
  }
  return ["状態", "オープン中"];
}

function buildAuxRows(
  aux: TimelineAuxiliary,
  timezone: string,
): ReadonlyArray<readonly [string, string]> {
  const fmt = (value: string | null): string =>
    value === null ? "-" : formatTimelineDateTime(value, timezone);
  const reaction =
    aux.firstReaction === null
      ? "-"
      : `${formatTimelineDateTime(aux.firstReaction.at, timezone)} (@${aux.firstReaction.by})`;
  return [
    buildStatusRow(aux, timezone),
    ["最初のコミット", fmt(aux.firstCommitAt)],
    ["レビュー依頼時刻", fmt(aux.readyForReviewAt)],
    ["最初のレビュー反応", reaction],
    ["最初の承認", fmt(aux.firstApproveAt)],
    ["承認回数", `${aux.approveCount} (うち取消 ${aux.dismissCount})`],
    ["レビュー反応数", `${aux.reviewCommentCount}`],
    ["承認後の追加コミット", `${aux.postApproveCommitCount}`],
  ];
}

function formatTimelineRange(
  startAt: string,
  endAt: string,
  timezone: string,
): string {
  const start = formatTimelinePoint(startAt, timezone);
  const end = formatTimelinePoint(endAt, timezone);
  if (start.date === end.date) {
    return `${start.time} - ${end.time}`;
  }
  return `${start.date} ${start.time} - ${end.date} ${end.time}`;
}

const TIMELINE_HOVER_SCRIPT = `
(function(){
  var roots = document.querySelectorAll('[data-component="timeline"]');
  var tooltip = null;
  function ensureTooltip(){
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }
  function escapeText(value){
    return String(value || '').replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function hideTooltip(){
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltip.innerHTML = '';
  }
  function positionTooltip(event){
    if (!tooltip || tooltip.hidden) return;
    var offset = 14;
    var x = event.clientX + offset;
    var y = event.clientY + offset;
    var rect = tooltip.getBoundingClientRect();
    var maxX = window.innerWidth - rect.width - 10;
    var maxY = window.innerHeight - rect.height - 10;
    tooltip.style.left = Math.max(10, Math.min(x, maxX)) + 'px';
    tooltip.style.top = Math.max(10, Math.min(y, maxY)) + 'px';
  }
  function buildAuxHtml(track){
    var row = track.closest('.timeline-row');
    if (!row) return '';
    var raw = row.getAttribute('data-aux');
    if (!raw) return '';
    var rows;
    try { rows = JSON.parse(raw); } catch (e) { return ''; }
    if (!Array.isArray(rows) || rows.length === 0) return '';
    var dl = rows.map(function(pair){
      var label = pair?.[0] ?? '';
      var value = pair?.[1] ?? '';
      return '<dt>' + escapeText(label) + '</dt><dd>' + escapeText(value) + '</dd>';
    }).join('');
    return '<dl>' + dl + '</dl>';
  }
  function showTrackTooltip(track, event){
    var segments = Array.prototype.slice.call(track.querySelectorAll('.segment[data-label]'));
    if (segments.length === 0) return;
    var items = segments.map(function(segment){
      var state = segment.getAttribute('data-state') || '';
      var label = segment.getAttribute('data-label') || '';
      return '<li><span class="timeline-tooltip-swatch ' + escapeText(state) + '"></span><span>' + escapeText(label) + '</span></li>';
    }).join('');
    var aux = buildAuxHtml(track);
    var tip = ensureTooltip();
    var html = '<div class="timeline-tooltip-title">ステータス詳細</div><ol>' + items + '</ol>' + aux;
    tip.innerHTML = html;
    tip.hidden = false;
    positionTooltip(event);
  }
  roots.forEach(function(root){
    function clear(){
      root.removeAttribute('data-hovered-filter');
      root.querySelectorAll('.timeline-filter-active').forEach(function(el){
        el.classList.remove('timeline-filter-active');
      });
    }
    function activateFilter(kind, value){
      var attr = kind === 'repo' ? 'data-repo' : 'data-author';
      root.setAttribute('data-hovered-filter', kind + ':' + value);
      root.querySelectorAll('.timeline-row[' + attr + ']').forEach(function(row){
        if (row.getAttribute(attr) === value) {
          row.classList.add('timeline-filter-active');
        }
      });
    }
    root.addEventListener('mouseover', function(e){
      var target = e.target;
      if (!target || !target.closest) return;
      var track = target.closest('.timeline-track');
      if (track && root.contains(track)) {
        showTrackTooltip(track, e);
      }
      var authorEl = target.closest('.pr-author[data-author]');
      if (authorEl && root.contains(authorEl)) {
        var author = authorEl.getAttribute('data-author');
        var authorFilter = 'author:' + author;
        if (!author || root.getAttribute('data-hovered-filter') === authorFilter) return;
        clear();
        activateFilter('author', author);
        return;
      }
      var repoEl = target.closest('.pr-ref[data-repo]');
      if (!repoEl || !root.contains(repoEl)) return;
      var repo = repoEl.getAttribute('data-repo');
      var repoFilter = 'repo:' + repo;
      if (!repo || root.getAttribute('data-hovered-filter') === repoFilter) return;
      clear();
      activateFilter('repo', repo);
    });
    root.addEventListener('mousemove', function(e){
      var target = e.target;
      if (!target || !target.closest || !target.closest('.timeline-track')) return;
      positionTooltip(e);
    });
    root.addEventListener('mouseout', function(e){
      var target = e.target;
      if (!target || !target.closest) return;
      var track = target.closest('.timeline-track');
      if (!track || !root.contains(track)) return;
      var related = e.relatedTarget;
      if (related && related.closest && related.closest('.timeline-track') === track) return;
      hideTooltip();
    });
    root.addEventListener('mouseleave', function(){
      clear();
      hideTooltip();
    });
  });
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('blur', hideTooltip);
})();
`.trim();

export function renderGanttChart(input: unknown): string {
  const data = (input as GanttData | undefined) ?? null;
  const timelines = data?.timelines ?? [];
  if (!data || timelines.length === 0) {
    return `<section><h2>PRタイムライン</h2><p class="empty">今週のタイムラインデータはありません。</p></section>`;
  }

  const weekStartMs = Date.parse(data.weekStart);
  const weekEndMs = Date.parse(data.weekEnd);
  const weekDurationMs = Math.max(weekEndMs - weekStartMs, 1);
  const timezone = data.timezone ?? "UTC";

  const dayCount = 7;
  const axisLabels: string[] = [];
  const bucketMs = weekDurationMs / dayCount;
  for (let i = 0; i < dayCount; i++) {
    const midMs = weekStartMs + i * bucketMs + bucketMs / 2;
    axisLabels.push(formatDayLabel(new Date(midMs)));
  }

  const rows = timelines
    .map((timeline) => {
      const bars = timeline.segments
        .map((segment) => {
          const startMs = Date.parse(segment.startAt);
          const endMs = Date.parse(segment.endAt);
          const left = clamp01((startMs - weekStartMs) / weekDurationMs);
          const right = clamp01((endMs - weekStartMs) / weekDurationMs);
          const width = right - left;
          if (width <= 0) return "";
          const widthPct = Math.max(width * 100, 0.5);
          const leftPct = left * 100;
          const durationMinutes = Math.max(1, Math.round(segment.durationHours * 60));
          const stateLabel = TIMELINE_STATE_LABELS[segment.state];
          const rangeLabel = formatTimelineRange(
            segment.startAt,
            segment.endAt,
            timezone,
          );
          const tooltipLabel = `${rangeLabel} / ${formatDurationMinutes(durationMinutes)} / ${stateLabel}`;
          return `<span class="segment ${escapeHtml(segment.state)}" style="left:${leftPct}%;width:${widthPct}%;" data-state="${escapeHtml(segment.state)}" data-start="${escapeHtml(segment.startAt)}" data-end="${escapeHtml(segment.endAt)}" data-duration-minutes="${durationMinutes}" data-label="${escapeHtml(tooltipLabel)}"></span>`;
        })
        .filter((html) => html !== "")
        .join("");

      if (bars === "") return "";

      const ref = `${timeline.repo.owner}/${timeline.repo.name}#${timeline.number}`;
      const repoKey = `${timeline.repo.owner}/${timeline.repo.name}`;
      const url = `https://github.com/${timeline.repo.owner}/${timeline.repo.name}/pull/${timeline.number}`;
      const author = timeline.author;
      const rowAuthorAttr =
        author === null ? "" : ` data-author="${escapeHtml(author)}"`;
      const authorHtml =
        author === null
          ? `<span class="pr-author">作成者不明</span>`
          : `<span class="pr-author" data-author="${escapeHtml(author)}">@${escapeHtml(author)}</span>`;
      const auxJson = JSON.stringify(buildAuxRows(timeline.auxiliary, timezone));
      const closedUnmergedAttr =
        timeline.auxiliary.closingState === "closed_unmerged"
          ? ` data-closed-unmerged="true"`
          : "";
      return `<article class="timeline-row" data-repo="${escapeHtml(repoKey)}"${rowAuthorAttr}${closedUnmergedAttr} data-aux="${escapeHtml(auxJson)}">
            <div class="timeline-meta">
              <span class="pr-title-line"><a class="pr-title" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(timeline.title)}</a><span class="pr-author-prefix">by</span>${authorHtml}</span>
              <span class="pr-ref" data-repo="${escapeHtml(repoKey)}">${escapeHtml(ref)}</span>
            </div>
            <div class="timeline-track-wrap">
              <div class="timeline-track">${bars}</div>
            </div>
          </article>`;
    })
    .filter((html) => html !== "")
    .join("");

  if (rows === "") {
    return `<section><h2>PRタイムライン</h2><p class="empty">今週のタイムラインデータはありません。</p></section>`;
  }

  const axis = `<div class="timeline-axis">${axisLabels
    .map((label) => `<span>${escapeHtml(label)}</span>`)
    .join("")}</div>`;

  const legendItems: ReadonlyArray<readonly [string, string]> = [
    ["implementing", TIMELINE_STATE_LABELS.implementing],
    ["wait_review", TIMELINE_STATE_LABELS.wait_review],
    ["fixing", TIMELINE_STATE_LABELS.fixing],
    ["wait_merge", TIMELINE_STATE_LABELS.wait_merge],
  ];
  const hasClosedUnmerged = timelines.some(
    (t) => t.auxiliary.closingState === "closed_unmerged",
  );
  const legend = `<div class="timeline-legend" aria-label="Timeline legend">${legendItems
    .map(
      ([state, label]) =>
        `<span class="legend-item"><span class="legend-swatch ${escapeHtml(state)}"></span>${escapeHtml(label)}</span>`,
    )
    .join("")}${
    hasClosedUnmerged
      ? `<span class="legend-item legend-closed-unmerged"><span class="legend-swatch legend-swatch-closed"></span>クローズ (未マージ)</span>`
      : ""
  }</div>`;

  const axisRow = `<article class="timeline-row timeline-axis-row" aria-hidden="true">
        <div class="timeline-meta">プルリクエスト</div>
        <div class="timeline-track-wrap">${axis}</div>
      </article>`;

  return `<section>
    <div class="section-head">
      <div>
        <h2>PRタイムライン</h2>
      </div>
      ${legend}
    </div>
    <div class="timeline-list" data-component="timeline">
      ${axisRow}
      ${rows}
    </div>
    <script>${TIMELINE_HOVER_SCRIPT}</script>
  </section>`;
}
