import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  SlidersHorizontal,
  Columns3,
  Download,
  FileJson,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Table2,
  Zap,
  Rows3,
  GripVertical,
  Calendar,
  X,
} from 'lucide-react';

const MONTH_MAP = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export function getIstOffsetIsoDate(daysOffset = 0) {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const d = new Date(nowStr);
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function extractIstIsoDateFromText(rawText) {
  if (!rawText) return null;
  const s = String(rawText).trim();
  if (!s) return null;

  const lower = s.toLowerCase();
  if (/\btoday\b|\bjust now\b|\bmoments ago\b/.test(lower)) {
    return getIstOffsetIsoDate(0);
  }
  if (/\byesterday\b/.test(lower)) {
    return getIstOffsetIsoDate(-1);
  }

  // ISO YYYY-MM-DD
  const isoMatch = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD MMM YYYY or DD MMM (e.g. "16 Nov 2026, 12:17 pm" or "16 Nov, 12:17 pm")
  const dmyText = s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,.-]*(20\d{2})?\b/i);
  if (dmyText) {
    const dd = String(Number(dmyText[1])).padStart(2, '0');
    const mm = MONTH_MAP[dmyText[2].slice(0, 3).toLowerCase()];
    const yyyy = dmyText[3] || getIstOffsetIsoDate(0).slice(0, 4);
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  // MMM DD, YYYY (e.g. "Nov 16, 2026")
  const mdyText = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})[\s,.-]*(20\d{2})?\b/i);
  if (mdyText) {
    const mm = MONTH_MAP[mdyText[1].slice(0, 3).toLowerCase()];
    const dd = String(Number(mdyText[2])).padStart(2, '0');
    const yyyy = mdyText[3] || getIstOffsetIsoDate(0).slice(0, 4);
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  // Numeric slash dates (DD/MM/YYYY or M/D/YYYY)
  const slashMatch = s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const yyyy = slashMatch[3];
    if (a > 12 && b <= 12) {
      return `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
    if (b > 12 && a <= 12) {
      return `${yyyy}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    return `${yyyy}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }

  return null;
}

const UI_ACTION_LABEL_RE =
  /^(call|call buyer|chat|whatsapp|copy|copied|✓|⧉|360°?|view|view leads.*|assigned leads.*|add lead|\+ add lead|edit|delete|remove|suspend|activate|verify|approve|reject|add money|\+ add money|receipt|download|invoice|assign|manage|open|reply|resolve|reopen|audit|details)$/i;

/**
 * Extracts human-readable text from any React node tree.
 * When `stripActionButtons` is true, pure action button/link labels (e.g. "Call", "Chat", "360°")
 * are omitted so CSV/JSON exports and sorting stay clean.
 */
export function extractNodeText(node, { stripActionButtons = false } = {}) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node
      .map((child) => extractNodeText(child, { stripActionButtons }))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (React.isValidElement(node)) {
    const tag = typeof node.type === 'string' ? node.type.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'svg') return '';

    const childText = extractNodeText(node.props?.children, { stripActionButtons });
    if (stripActionButtons && (tag === 'button' || tag === 'a')) {
      const trimmed = childText.trim();
      if (UI_ACTION_LABEL_RE.test(trimmed)) {
        return '';
      }
    }
    if (childText) return childText;
    if (typeof node.props?.value === 'string' || typeof node.props?.value === 'number') {
      return String(node.props.value);
    }
    if (!stripActionButtons) {
      if (typeof node.props?.title === 'string') return node.props.title;
      if (typeof node.props?.['aria-label'] === 'string') return node.props['aria-label'];
    }
  }
  return '';
}

/**
 * Checks if a React subtree contains interactive elements (<button>, <a>, <select>, <input>).
 */
function hasInteractiveChild(node) {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasInteractiveChild);
  if (React.isValidElement(node)) {
    const tag = typeof node.type === 'string' ? node.type.toLowerCase() : '';
    if (tag === 'button' || tag === 'a' || tag === 'select' || tag === 'input') return true;
    if (typeof node.props?.onClick === 'function') return true;
    return hasInteractiveChild(node.props?.children);
  }
  return false;
}

/**
 * Smart multi-type comparator supporting INR/USD currency, percentages, dates, and natural text.
 */
function compareCellValues(rawA, rawB, direction = 'asc') {
  const a = String(rawA ?? '').trim();
  const b = String(rawB ?? '').trim();
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const mult = direction === 'desc' ? -1 : 1;

  // 1. Numeric / Currency / Percentage check (e.g., "₹6,000", "+₹2,400", "60%", "$120.50", "₹6,000 20 Days...")
  const leadCurrencyA = a.match(/^[+-]?[₹$€£]?\s*([\d,]+(?:\.\d+)?)/);
  const leadCurrencyB = b.match(/^[+-]?[₹$€£]?\s*([\d,]+(?:\.\d+)?)/);
  const cleanNumA = a.replace(/[₹$€£,\s%+]/g, '').replace(/\/(day|mo|wk|month|d)$/i, '');
  const cleanNumB = b.replace(/[₹$€£,\s%+]/g, '').replace(/\/(day|mo|wk|month|d)$/i, '');
  if (/^-?\d+(\.\d+)?$/.test(cleanNumA) && /^-?\d+(\.\d+)?$/.test(cleanNumB)) {
    const numA = Number(cleanNumA);
    const numB = Number(cleanNumB);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
      return (numA - numB) * mult;
    }
  } else if (leadCurrencyA && leadCurrencyB && /[₹$€£]/.test(a) && /[₹$€£]/.test(b)) {
    const numA = Number(leadCurrencyA[1].replace(/,/g, '')) * (a.startsWith('-') ? -1 : 1);
    const numB = Number(leadCurrencyB[1].replace(/,/g, '')) * (b.startsWith('-') ? -1 : 1);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
      return (numA - numB) * mult;
    }
  }

  // 2. Date check (ISO or "14 Nov 2026...")
  if (
    (/\d{4}-\d{2}-\d{2}/.test(a) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(a)) &&
    (/\d{4}-\d{2}-\d{2}/.test(b) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(b))
  ) {
    const tA = Date.parse(a);
    const tB = Date.parse(b);
    if (!Number.isNaN(tA) && !Number.isNaN(tB) && tA !== tB) {
      return (tA - tB) * mult;
    }
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) * mult;
}

function downloadCsvFile(headers, rowsTextMatrix, filename = 'ad-mafia-export') {
  if (typeof window === 'undefined') return;
  const escapeCsv = (val) => {
    const s = String(val ?? '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.includes(',') || s.includes('"') || s.includes(';')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rowsTextMatrix.map((row) => row.map(escapeCsv).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadJsonFile(headers, rowsTextMatrix, filename = 'ad-mafia-export') {
  if (typeof window === 'undefined') return;
  const objects = rowsTextMatrix.map((row) => {
    const item = {};
    headers.forEach((h, idx) => {
      item[h] = row[idx] ?? '';
    });
    return item;
  });
  const blob = new Blob([JSON.stringify(objects, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Computes balanced proportional widths for Tabulator columns so no single column
 * hogs 500px+ or pushes right-hand columns (Status / Actions) off a 1366px laptop screen.
 */
function computeTabulatorColSpec(header, totalCols = 6) {
  const label = String(header.label || '').trim();
  const lower = label.toLowerCase();
  const thStyle = header.thElement?.props?.style || {};
  const alignRight = thStyle.textAlign === 'right' || header.isActionCol;
  const alignCenter = thStyle.textAlign === 'center';
  const hozAlign = alignRight ? 'right' : alignCenter ? 'center' : 'left';
  const dense = totalCols >= 7;

  if (label === '#' || lower === 's.no' || lower === 'sr') {
    return { width: 52, minWidth: 46, widthGrow: 0, hozAlign: 'center', headerHozAlign: 'center' };
  }
  if (header.isActionCol) {
    return { minWidth: dense ? 132 : 156, widthGrow: 1.15, hozAlign: 'right', headerHozAlign: 'right' };
  }
  if (/username|workspace|business|company|customer|client|account|entity|description|queries|ticket/.test(lower)) {
    return { minWidth: dense ? 158 : 200, widthGrow: 1.7, hozAlign, headerHozAlign: hozAlign };
  }
  if (/email|location|purpose|notes|audit|details|address/.test(lower)) {
    return { minWidth: dense ? 124 : 160, widthGrow: 1.35, hozAlign, headerHozAlign: hozAlign };
  }
  if (/mobile|phone|contact|whatsapp|date|time|receipt|ref|transaction|utr/.test(lower)) {
    return { minWidth: dense ? 122 : 146, widthGrow: 1.15, hozAlign, headerHozAlign: hozAlign };
  }
  if (/wallet|balance|amount|runway|pacing|price|budget|spend|revenue|paid/.test(lower)) {
    return { minWidth: dense ? 108 : 132, widthGrow: 1.08, hozAlign, headerHozAlign: hozAlign };
  }
  if (/^(status|state|stage|type|role|mode|tier|priority)$/.test(lower)) {
    return { minWidth: dense ? 76 : 98, widthGrow: 0.75, hozAlign, headerHozAlign: hozAlign };
  }
  if (/status|profile|payment|gate|stage|type|method|category|role|compliance|verification/.test(lower)) {
    return { minWidth: dense ? 102 : 124, widthGrow: 0.98, hozAlign, headerHozAlign: hozAlign };
  }
  return { minWidth: dense ? 104 : 128, widthGrow: 1.02, hozAlign, headerHozAlign: hozAlign };
}

let portalHostUidSeq = 1;

/**
 * `<TabulatorLiveGrid>` — Renders real, interactive React `<td>` JSX cells and React `<th>`
 * headers directly inside a genuine Tabulator v6 (`TabulatorFull`) instance via `createPortal`.
 * Preserves 100% of badges, pills, multi-line typography, links, and live action buttons while
 * providing native Tabulator column drag-reordering (`movableColumns`) and edge-resizing (`resizable`).
 */
function TabulatorLiveGrid({
  visibleHeaders,
  pagedRecords,
  emptyNode,
  sortState,
  onToggleSort,
  showColFilters,
  colFilters,
  onColFilterChange,
  onClearColFilters,
  activeColFilterCount,
  fallbackTableNode,
}) {
  const mountRef = useRef(null);
  const tabulatorRef = useRef(null);
  const [engineReady, setEngineReady] = useState(false);
  const [, setPortalTick] = useState(0);

  const headerHostsRef = useRef(new Map()); // colIdx -> HTMLElement
  const cellHostsRef = useRef(new Map()); // `${rowKey}::${colIdx}` -> HTMLElement
  const subRowHostsRef = useRef(new Map()); // `${rowKey}` -> HTMLElement
  const recordsByKeyRef = useRef(new Map());
  const onToggleSortRef = useRef(onToggleSort);
  const syncRafRef = useRef(false);
  const prevRowSigRef = useRef('');

  onToggleSortRef.current = onToggleSort;

  // Keep latest row records accessible to Tabulator rowClick / rowFormatter callbacks
  const recordsMap = useMemo(() => {
    const m = new Map();
    pagedRecords.forEach((rec) => {
      m.set(String(rec.key), rec);
    });
    return m;
  }, [pagedRecords]);
  recordsByKeyRef.current = recordsMap;

  const schedulePortalSync = useCallback(() => {
    if (syncRafRef.current) return;
    syncRafRef.current = true;
    const flush = () => {
      syncRafRef.current = false;
      setPortalTick((t) => t + 1);
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          setPortalTick((t) => t + 1);
        });
      }
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(flush);
    } else {
      Promise.resolve().then(flush);
    }
  }, []);

  const headerSchemaSig = useMemo(
    () => visibleHeaders.map((h) => `${h.idx}:${h.label}`).join('||'),
    [visibleHeaders]
  );

  const rowSequenceSig = useMemo(
    () => pagedRecords.map((r) => `${r.key}:${r.subRows.length}`).join('||'),
    [pagedRecords]
  );

  // Build Tabulator instance whenever the visible column schema changes
  useEffect(() => {
    if (typeof window === 'undefined' || !mountRef.current) return undefined;
    let cancelled = false;

    import('tabulator-tables')
      .then((mod) => {
        if (cancelled || !mountRef.current) return;
        const TabulatorFull = mod.TabulatorFull || mod.default;
        if (!TabulatorFull) return;

        if (tabulatorRef.current) {
          try {
            tabulatorRef.current.destroy();
          } catch {}
          tabulatorRef.current = null;
        }
        headerHostsRef.current.clear();
        cellHostsRef.current.clear();
        subRowHostsRef.current.clear();

        const tabCols = visibleHeaders.map((h) => {
          const spec = computeTabulatorColSpec(h, visibleHeaders.length);
          let downX = 0;
          let downY = 0;

          return {
            title: h.label,
            field: `col_${h.idx}`,
            headerSort: false,
            resizable: true,
            ...spec,
            titleFormatter: () => {
              const host = document.createElement('div');
              host.className = 'am-tab-header-host';
              host.dataset.uid = String(portalHostUidSeq++);
              host.dataset.colIdx = String(h.idx);
              host.addEventListener('pointerdown', (ev) => {
                downX = ev.clientX || 0;
                downY = ev.clientY || 0;
              });
              host.addEventListener('click', (ev) => {
                if (h.isActionCol) return;
                if (ev.target && ev.target.closest('input, button, select, textarea, a')) return;
                const moved = Math.hypot((ev.clientX || 0) - downX, (ev.clientY || 0) - downY);
                if (moved > 6) return; // Ignore column-drag release
                if (typeof onToggleSortRef.current === 'function') {
                  onToggleSortRef.current(h.idx, h.isActionCol);
                }
              });
              headerHostsRef.current.set(h.idx, host);
              schedulePortalSync();
              return host;
            },
            formatter: (cell) => {
              const rowData = cell.getData() || {};
              const rowKey = String(rowData._rowKey ?? '');
              const host = document.createElement('div');
              host.className = `am-tab-cell-host ${spec.hozAlign === 'right' ? 'align-right' : spec.hozAlign === 'center' ? 'align-center' : ''}`.trim();
              host.dataset.uid = String(portalHostUidSeq++);
              if (rowKey) {
                cellHostsRef.current.set(`${rowKey}::${h.idx}`, host);
              }
              schedulePortalSync();
              return host;
            },
          };
        });

        const initialEntries = Array.from(recordsByKeyRef.current.values());
        const initialData = initialEntries.map((rec) => ({
          id: String(rec.key),
          _rowKey: String(rec.key),
        }));
        prevRowSigRef.current = initialEntries.map((r) => `${r.key}:${r.subRows.length}`).join('||');

        const table = new TabulatorFull(mountRef.current, {
          data: initialData,
          columns: tabCols,
          layout: 'fitColumns',
          layoutColumnsOnNewData: true,
          responsiveLayout: false,
          movableColumns: true,
          renderVertical: 'basic',
          renderHorizontal: 'basic',
          autoResize: true,
          placeholder: '',
          rowFormatter: (row) => {
            const rk = String(row.getData()?._rowKey ?? '');
            const rec = recordsByKeyRef.current.get(rk);
            const rowEl = row.getElement();
            if (!rowEl || !rec) return;
            const trStyle = rec.trElement?.props?.style;
            if (trStyle?.background) {
              rowEl.style.background = trStyle.background;
            }
            if (typeof rec.trElement?.props?.onClick === 'function') {
              rowEl.style.cursor = 'pointer';
            }
            if (rec.subRows && rec.subRows.length > 0) {
              rowEl.classList.add('am-tab-has-subrow');
              const subHost = document.createElement('div');
              subHost.className = 'am-tab-subrow-host';
              subHost.dataset.uid = String(portalHostUidSeq++);
              rowEl.appendChild(subHost);
              subRowHostsRef.current.set(rk, subHost);
              schedulePortalSync();
            }
          },
        });

        table.on('rowClick', (e, row) => {
          if (e.target && e.target.closest('button, a, input, select, textarea, label')) return;
          const rk = String(row.getData()?._rowKey ?? '');
          const rec = recordsByKeyRef.current.get(rk);
          if (rec && typeof rec.trElement?.props?.onClick === 'function') {
            rec.trElement.props.onClick(e);
          }
        });

        table.on('columnMoved', () => {
          schedulePortalSync();
        });

        table.on('columnResized', () => {
          schedulePortalSync();
        });

        table.on('dataProcessed', () => {
          schedulePortalSync();
        });

        table.on('renderComplete', () => {
          schedulePortalSync();
        });

        table.on('tableBuilt', () => {
          if (cancelled) return;
          setEngineReady(true);
          try {
            table.redraw(true);
          } catch {}
          schedulePortalSync();
        });

        tabulatorRef.current = table;
      })
      .catch((err) => {
        console.warn('[TabulatorLiveGrid] Fallback to standard grid:', err);
      });

    return () => {
      cancelled = true;
      setEngineReady(false);
      if (tabulatorRef.current) {
        try {
          tabulatorRef.current.destroy();
        } catch {}
        tabulatorRef.current = null;
      }
      headerHostsRef.current.clear();
      cellHostsRef.current.clear();
      subRowHostsRef.current.clear();
    };
  }, [headerSchemaSig, schedulePortalSync]);

  // Re-layout automatically if container width transitions from 0 (e.g. tab switch / drawer) to > 0
  useEffect(() => {
    if (!engineReady || typeof ResizeObserver === 'undefined' || !mountRef.current) return undefined;
    let lastW = mountRef.current.clientWidth || 0;
    const ro = new ResizeObserver((entries) => {
      const nextW = entries[0]?.contentRect?.width || mountRef.current?.clientWidth || 0;
      if (nextW > 0 && Math.abs(nextW - lastW) > 2) {
        const wasZero = lastW === 0;
        lastW = nextW;
        if (tabulatorRef.current) {
          try {
            tabulatorRef.current.redraw(wasZero);
          } catch {}
          schedulePortalSync();
        }
      }
    });
    ro.observe(mountRef.current);
    return () => ro.disconnect();
  }, [engineReady, schedulePortalSync]);

  // Update Tabulator rows ONLY when the visible row key order/membership changes
  useEffect(() => {
    if (!engineReady || !tabulatorRef.current) return;
    if (prevRowSigRef.current === rowSequenceSig) return;
    const wasEmpty = prevRowSigRef.current === '';
    prevRowSigRef.current = rowSequenceSig;

    cellHostsRef.current.clear();
    subRowHostsRef.current.clear();
    const nextRows = pagedRecords.map((rec) => ({
      id: String(rec.key),
      _rowKey: String(rec.key),
    }));

    const finalizeSync = () => {
      if (wasEmpty && nextRows.length > 0 && tabulatorRef.current) {
        try {
          tabulatorRef.current.redraw(true);
        } catch {}
      }
      schedulePortalSync();
    };

    try {
      const maybePromise = tabulatorRef.current.replaceData(nextRows);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finalizeSync).catch(finalizeSync);
      } else {
        finalizeSync();
      }
    } catch {
      finalizeSync();
    }
  }, [rowSequenceSig, pagedRecords, engineReady, schedulePortalSync]);

  // Assemble live React portals for headers + cells (no `isConnected` drop race!)
  const headerPortals = [];
  const cellPortals = [];

  if (engineReady && typeof document !== 'undefined') {
    visibleHeaders.forEach((h) => {
      const hostEl = headerHostsRef.current.get(h.idx);
      if (!hostEl) return;
      const isSorted = sortState.colIdx === h.idx;
      const alignRight = h.thElement?.props?.style?.textAlign === 'right' || h.isActionCol;

      headerPortals.push(
        createPortal(
          <div className={`am-tab-hdr-inner ${alignRight ? 'is-right' : ''} ${isSorted ? 'is-sorted' : ''}`}>
            <div
              className={`am-tab-hdr-title-row ${!h.isActionCol ? 'is-sortable' : ''}`}
              title={!h.isActionCol ? 'Click to sort • Drag to reorder column' : h.label}
            >
              <GripVertical size={11} className="am-tab-grip-ico" aria-hidden="true" />
              <span className="am-tab-hdr-label">{h.thElement?.props?.children ?? h.label}</span>
              {!h.isActionCol && (
                <span className={`am-tab-sort-pill ${isSorted ? 'active' : ''}`} aria-hidden="true">
                  {isSorted ? (
                    sortState.dir === 'asc' ? (
                      <ArrowUp size={12} />
                    ) : (
                      <ArrowDown size={12} />
                    )
                  ) : (
                    <ArrowUpDown size={11} />
                  )}
                </span>
              )}
            </div>

            {showColFilters && (
              <div
                className="am-tab-hdr-filter-wrap"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {!h.isActionCol ? (
                  <input
                    type="text"
                    value={colFilters[h.idx] || ''}
                    onChange={(e) => onColFilterChange(h.idx, e.target.value)}
                    placeholder={`Filter ${h.label}...`}
                    className="am-st-col-filter-input"
                  />
                ) : activeColFilterCount > 0 ? (
                  <button type="button" className="am-st-reset-link" onClick={onClearColFilters}>
                    Reset
                  </button>
                ) : null}
              </div>
            )}
          </div>,
          hostEl,
          `hdr_${h.idx}_${hostEl.dataset.uid}`
        )
      );
    });

    pagedRecords.forEach((rec) => {
      const rk = String(rec.key);
      visibleHeaders.forEach((h) => {
        const hostEl = cellHostsRef.current.get(`${rk}::${h.idx}`);
        if (!hostEl) return;
        const td = rec.tdElements[h.idx];
        const cellChildren = td ? td.props?.children : '—';
        cellPortals.push(
          createPortal(
            <div className="am-tab-cell-inner">{cellChildren}</div>,
            hostEl,
            `cell_${rk}_${h.idx}_${hostEl.dataset.uid}`
          )
        );
      });
      if (rec.subRows && rec.subRows.length > 0) {
        const subHostEl = subRowHostsRef.current.get(rk);
        if (subHostEl) {
          cellPortals.push(
            createPortal(
              <div className="am-tab-subrow-inner">
                {rec.subRows.map((sr, sIdx) => {
                  const srTds = React.Children.toArray(sr.props?.children).filter(React.isValidElement);
                  return (
                    <div key={sIdx} className="am-tab-subrow-block">
                      {srTds[0]?.props?.children ?? sr.props?.children}
                    </div>
                  );
                })}
              </div>,
              subHostEl,
              `sub_${rk}_${subHostEl.dataset.uid}`
            )
          );
        }
      }
    });
  }

  return (
    <div className="am-tabulator-live-wrap">
      {!engineReady && fallbackTableNode}
      <div
        ref={mountRef}
        className={`am-tabulator-mount ${pagedRecords.length === 0 ? 'am-tab-is-empty' : ''}`}
      />
      {engineReady && pagedRecords.length === 0 && (
        <div className="am-tab-empty-overlay">{emptyNode}</div>
      )}
      {headerPortals}
      {cellPortals}
    </div>
  );
}

/**
 * Standalone Native Tabulator v6 (`tabulator-tables`) Data Grid Component
 * for dynamic JSON/collection schemas (e.g., Super Admin Live MongoDB Document Explorer).
 */
export function TabulatorDataGrid({
  columns = [],
  data = [],
  pageSize = 15,
  exportFilename = 'ad-mafia-grid',
  height,
}) {
  const containerRef = useRef(null);
  const instanceRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const serializedCols = useMemo(
    () => JSON.stringify(columns.map((c) => `${c.field}:${c.title}`)),
    [columns]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return undefined;
    let cancelled = false;

    import('tabulator-tables')
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const TabulatorFull = mod.TabulatorFull || mod.default;
        if (!TabulatorFull) return;

        if (instanceRef.current) {
          try {
            instanceRef.current.destroy();
          } catch {}
          instanceRef.current = null;
        }

        const tabCols = columns.map((col, idx) => ({
          title: col.title || col.field || `Column ${idx + 1}`,
          field: col.field || `col_${idx}`,
          ...(showFilters
            ? {
                headerFilter: 'input',
                headerFilterPlaceholder: `Filter ${col.title || ''}...`,
              }
            : {}),
          minWidth: col.minWidth || 150,
          widthGrow: idx === 0 ? 1.4 : 1,
          hozAlign: col.hozAlign || 'left',
          resizable: true,
          headerSort: true,
          formatter: 'plaintext',
        }));

        const table = new TabulatorFull(containerRef.current, {
          data: Array.isArray(data) ? data : [],
          columns: tabCols,
          layout: 'fitColumns',
          layoutColumnsOnNewData: true,
          responsiveLayout: false,
          movableColumns: true,
          pagination: 'local',
          paginationSize: pageSize || 15,
          paginationSizeSelector: [10, 25, 50, 100],
          paginationCounter: 'rows',
          placeholder: 'No matching documents in this collection.',
          ...(height ? { maxHeight: height } : {}),
        });

        table.on('tableBuilt', () => {
          if (cancelled) return;
          setReady(true);
          try {
            table.redraw(true);
          } catch {}
        });

        instanceRef.current = table;
      })
      .catch((err) => {
        console.warn('[TabulatorDataGrid] Failed to initialize Tabulator:', err);
      });

    return () => {
      cancelled = true;
      setReady(false);
      if (instanceRef.current) {
        try {
          instanceRef.current.destroy();
        } catch {}
        instanceRef.current = null;
      }
    };
  }, [serializedCols, pageSize, height, showFilters]);

  useEffect(() => {
    if (ready && instanceRef.current && typeof instanceRef.current.replaceData === 'function') {
      try {
        instanceRef.current.replaceData(Array.isArray(data) ? data : []);
      } catch {}
    }
  }, [data, ready]);

  return (
    <div className="am-tabulator-native-shell">
      <div className="am-st-toolbar">
        <div className="am-st-toolbar-left">
          <span className="am-st-count-pill">
            {Array.isArray(data) ? data.length : 0} {data?.length === 1 ? 'document' : 'documents'}
          </span>
        </div>
        <div className="am-st-toolbar-right">
          <button
            type="button"
            className={`am-st-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={13} />
            <span>Column Filters</span>
          </button>
          <button
            type="button"
            className="am-st-btn"
            onClick={() => instanceRef.current?.download('csv', `${exportFilename}.csv`)}
          >
            <Download size={13} />
            <span>CSV</span>
          </button>
          <button
            type="button"
            className="am-st-btn"
            onClick={() => instanceRef.current?.download('json', `${exportFilename}.json`)}
          >
            <FileJson size={13} />
            <span>JSON</span>
          </button>
        </div>
      </div>
      <div ref={containerRef} className="am-tabulator-mount am-tabulator-standalone-mount" />
    </div>
  );
}

/**
 * `<SmartTable>` — Enterprise Tabulator v6 + Responsive Cards Data Table Suite.
 *
 * - Desktop (`> 768px`): Defaults to `tabulator` mode — genuine Tabulator v6 (`TabulatorFull`)
 *   mounting 100% live React JSX cells via `createPortal` (badges, avatars, Call/Chat links,
 *   and live Action buttons all work natively!) with draggable column reordering, resizable
 *   column edges, multi-type sorting, toggleable column filters, column visibility, CSV/JSON/Print,
 *   and clean pagination.
 * - Mobile (`<= 768px`): Defaults to `cards` mode — clean stacked cards with full-width action buttons.
 * - Auto-suppresses duplicate quick-search input when the parent desk already renders a search bar.
 */
export function SmartTable({
  children,
  title = '',
  defaultPageSize = 10,
  exportFilename = 'ad-mafia-records',
  enableSearch = true,
  forceSearch = false,
  enableDateFilter = true,
  minimal = false,
  defaultMobileView = 'cards', // 'cards' | 'tabulator' | 'grid'
  className = '',
}) {
  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768 && defaultMobileView === 'cards') {
      return 'cards';
    }
    return 'tabulator';
  });
  const [userPickedMode, setUserPickedMode] = useState(false);
  const [hasParentSearch, setHasParentSearch] = useState(false);
  const [isInsideModal, setIsInsideModal] = useState(false);

  const [quickSearch, setQuickSearch] = useState('');
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ colIdx: null, dir: null });
  const [hiddenCols, setHiddenCols] = useState({});
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const wrapRef = useRef(null);
  const colMenuRef = useRef(null);

  // Detect modal hosting & parent search inputs
  useEffect(() => {
    if (typeof document === 'undefined' || !wrapRef.current) return;
    const modalHost = Boolean(
      wrapRef.current.closest(
        '.sales-modal-overlay, .sa-modal-overlay, .marketing-modal-overlay, .graphics-modal-overlay, .portal-modal-backdrop, [role="dialog"]'
      )
    );
    setIsInsideModal(modalHost);
    if (!enableSearch || forceSearch) return;
    if (modalHost) {
      setHasParentSearch(false);
      return;
    }
    const hostSection = wrapRef.current.closest(
      '.desk-page-container, .sales-body-wrap, .sa-desk, .sa-page, .sa-content-body, .sa-desk-content, .marketing-main, .marketing-page-container, .marketing-page-body, .graphics-main, .graphics-content-body, .graphics-page-body, .wallet-ledger-card, .cp-page, .portal-page-wrap, .pipeline-page-wrap, .followups-page-wrap'
    );
    if (!hostSection) return;
    const siblingTables = hostSection.querySelectorAll('.am-smart-table-wrap');
    if (siblingTables.length > 1) {
      setHasParentSearch(false);
      return;
    }
    const candidateInputs = hostSection.querySelectorAll(
      'input[type="text"], input[type="search"], .desk-search-input, .appr-search-input, .sa-search-input'
    );
    let foundOutside = false;
    candidateInputs.forEach((inp) => {
      if (wrapRef.current && wrapRef.current.contains(inp)) return;
      if (inp.closest('.am-smart-table-wrap, .am-tabulator-native-shell, form')) return;
      if (inp.closest('.sales-modal-overlay, .sa-modal-overlay, .marketing-modal-overlay, .graphics-modal-overlay, [role="dialog"]')) return;
      const ph = String(inp.getAttribute('placeholder') || '').toLowerCase();
      const cls = String(inp.className || '').toLowerCase();
      if (ph.includes('search') || ph.includes('filter') || cls.includes('search')) {
        foundOutside = true;
      }
    });
    setHasParentSearch(foundOutside);
  }, [enableSearch, forceSearch]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      const mob = window.innerWidth <= 768;
      setIsMobileScreen(mob);
      if (!userPickedMode) {
        setViewMode(mob && defaultMobileView === 'cards' ? 'cards' : 'tabulator');
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [userPickedMode, defaultMobileView]);

  useEffect(() => {
    if (!colMenuOpen || typeof document === 'undefined') return undefined;
    const handleOutside = (e) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [colMenuOpen]);

  // Parse the child `<table>` element safely
  const parsed = useMemo(() => {
    const childArr = React.Children.toArray(children);
    const tableEl = childArr.find(
      (el) => React.isValidElement(el) && (el.type === 'table' || el.props?.className?.includes('table'))
    );
    if (!tableEl) {
      return { valid: false };
    }

    const tableSections = React.Children.toArray(tableEl.props?.children);
    const theadEl = tableSections.find((el) => React.isValidElement(el) && el.type === 'thead');
    const tbodyEl = tableSections.find((el) => React.isValidElement(el) && el.type === 'tbody');
    const tfootEl = tableSections.find((el) => React.isValidElement(el) && el.type === 'tfoot');

    if (!theadEl || !tbodyEl) {
      return { valid: false };
    }

    const headRows = React.Children.toArray(theadEl.props?.children).filter(React.isValidElement);
    const primaryHeadRow = headRows[0];
    if (!primaryHeadRow) {
      return { valid: false };
    }

    const thElements = React.Children.toArray(primaryHeadRow.props?.children).filter(React.isValidElement);
    const headers = thElements.map((th, idx) => {
      const label = extractNodeText(th.props?.children) || `Column ${idx + 1}`;
      const lower = label.toLowerCase();
      const isActionCol =
        /action|manage|control|receipt \/ action|direct operations|quick|options/.test(lower) ||
        (idx === thElements.length - 1 && /action|view|edit|audit|verify|download|assign/.test(lower));
      const isStatusCol = /status|stage|state|verification|queue/.test(lower) && !isActionCol;
      const isDateCol =
        !isActionCol &&
        /\b(date|time|received|registered|created|deleted|scheduled|updated|timestamp|when)\b/i.test(lower);
      return {
        idx,
        label,
        thElement: th,
        isActionCol,
        isStatusCol,
        isDateCol,
      };
    });
    const dateColIndices = headers.filter((h) => h.isDateCol).map((h) => h.idx);

    const rawBodyRows = React.Children.toArray(tbodyEl.props?.children).filter(React.isValidElement);
    const dataRecords = [];
    const seenKeys = new Set();
    let emptyPlaceholderRow = null;

    for (let rIdx = 0; rIdx < rawBodyRows.length; rIdx += 1) {
      const tr = rawBodyRows[rIdx];
      const tdList = React.Children.toArray(tr.props?.children).filter(React.isValidElement);
      const singleSpanTd =
        tdList.length === 1 && Number(tdList[0]?.props?.colSpan || 1) > 1 && headers.length > 1;

      if (singleSpanTd) {
        if (dataRecords.length === 0 && rawBodyRows.length === 1) {
          emptyPlaceholderRow = tr;
        } else if (dataRecords.length > 0) {
          dataRecords[dataRecords.length - 1].subRows.push(tr);
        } else {
          emptyPlaceholderRow = tr;
        }
        continue;
      }

      const cellTexts = headers.map((_, cIdx) =>
        extractNodeText(tdList[cIdx]?.props?.children, { stripActionButtons: true })
      );
      const fullSearchTexts = headers.map((_, cIdx) =>
        extractNodeText(tdList[cIdx]?.props?.children, { stripActionButtons: false })
      );
      const hasActionInLast = hasInteractiveChild(tdList[tdList.length - 1]?.props?.children);

      const rawKey =
        tr.key != null && String(tr.key) !== '' && !String(tr.key).endsWith('undefined')
          ? String(tr.key)
          : `row_${rIdx}`;
      const uniqueKey = seenKeys.has(rawKey) ? `${rawKey}__${rIdx}` : rawKey;
      seenKeys.add(uniqueKey);

      let rowIsoDate = null;
      for (const dIdx of dateColIndices) {
        const parsedDate = extractIstIsoDateFromText(cellTexts[dIdx]);
        if (parsedDate) {
          rowIsoDate = parsedDate;
          break;
        }
      }

      dataRecords.push({
        originalIdx: rIdx,
        key: uniqueKey,
        trElement: tr,
        tdElements: tdList,
        cellTexts,
        rowIsoDate,
        joinedSearchText: fullSearchTexts.join(' ').toLowerCase(),
        hasActionInLast,
        subRows: [],
      });
    }

    return {
      valid: true,
      tableEl,
      theadEl,
      tbodyEl,
      tfootEl,
      primaryHeadRow,
      headers,
      dateColIndices,
      dataRecords,
      emptyPlaceholderRow,
    };
  }, [children]);

  const processedRecords = useMemo(() => {
    if (!parsed.valid) return [];
    let list = parsed.dataRecords;

    if (datePreset !== 'all' && parsed.dateColIndices?.length > 0) {
      const todayIso = getIstOffsetIsoDate(0);
      let minIso = '';
      let maxIso = '';
      if (datePreset === 'today') {
        minIso = todayIso;
        maxIso = todayIso;
      } else if (datePreset === 'yesterday') {
        const yIso = getIstOffsetIsoDate(-1);
        minIso = yIso;
        maxIso = yIso;
      } else if (datePreset === '7d') {
        minIso = getIstOffsetIsoDate(-6);
        maxIso = todayIso;
      } else if (datePreset === '30d') {
        minIso = getIstOffsetIsoDate(-29);
        maxIso = todayIso;
      } else if (datePreset === 'custom') {
        minIso = customFrom || '';
        maxIso = customTo || '';
      }

      if (minIso || maxIso) {
        list = list.filter((rec) => {
          if (!rec.rowIsoDate) return false;
          if (minIso && rec.rowIsoDate < minIso) return false;
          if (maxIso && rec.rowIsoDate > maxIso) return false;
          return true;
        });
      }
    }

    const q = quickSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((rec) => rec.joinedSearchText.includes(q));
    }

    const activeColFilterEntries = Object.entries(colFilters).filter(
      ([, val]) => typeof val === 'string' && val.trim() !== ''
    );
    if (activeColFilterEntries.length > 0) {
      list = list.filter((rec) =>
        activeColFilterEntries.every(([colIdxStr, filterVal]) => {
          const cIdx = Number(colIdxStr);
          const cellVal = String(rec.cellTexts[cIdx] || '').toLowerCase();
          return cellVal.includes(filterVal.trim().toLowerCase());
        })
      );
    }

    if (sortState.colIdx !== null && sortState.dir) {
      const cIdx = sortState.colIdx;
      const dir = sortState.dir;
      list = [...list].sort((a, b) => compareCellValues(a.cellTexts[cIdx], b.cellTexts[cIdx], dir));
    }

    return list;
  }, [parsed, datePreset, customFrom, customTo, quickSearch, colFilters, sortState]);

  const totalSourceCount = parsed.valid ? parsed.dataRecords.length : 0;
  const totalFilteredCount = processedRecords.length;
  const effectivePageSize = pageSize === 'all' ? Math.max(1, totalFilteredCount) : Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / effectivePageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [quickSearch, datePreset, customFrom, customTo, colFilters, pageSize, totalSourceCount]);

  const handleToggleSort = useCallback((colIdx, isActionCol) => {
    if (isActionCol) return;
    setSortState((prev) => {
      if (prev.colIdx !== colIdx) return { colIdx, dir: 'asc' };
      if (prev.dir === 'asc') return { colIdx, dir: 'desc' };
      return { colIdx: null, dir: null };
    });
  }, []);

  const handleColFilterChange = useCallback((colIdx, value) => {
    setColFilters((prev) => ({ ...prev, [colIdx]: value }));
  }, []);

  const handleClearColFilters = useCallback(() => {
    setColFilters({});
  }, []);

  if (!parsed.valid) {
    return <>{children}</>;
  }

  const startIdx = (safePage - 1) * effectivePageSize;
  const pagedRecords =
    pageSize === 'all'
      ? processedRecords
      : processedRecords.slice(startIdx, startIdx + effectivePageSize);

  const visibleHeaders = parsed.headers.filter((h) => !hiddenCols[h.idx]);
  const visibleColCount = Math.max(1, visibleHeaders.length);
  const showQuickSearchInput = enableSearch && (forceSearch || !hasParentSearch);

  const handleSwitchMode = (mode) => {
    setUserPickedMode(true);
    setViewMode(mode);
  };

  const getExportPayload = () => {
    const exportCols = visibleHeaders.filter((h) => !h.isActionCol);
    const colsToUse = exportCols.length > 0 ? exportCols : visibleHeaders;
    const headerNames = colsToUse.map((h) => h.label);
    const matrix = processedRecords.map((rec) => colsToUse.map((h) => rec.cellTexts[h.idx] || ''));
    return { headerNames, matrix };
  };

  const handleExportCsv = () => {
    const { headerNames, matrix } = getExportPayload();
    downloadCsvFile(headerNames, matrix, exportFilename || title || 'ad-mafia-table');
  };

  const handleExportJson = () => {
    const { headerNames, matrix } = getExportPayload();
    downloadJsonFile(headerNames, matrix, exportFilename || title || 'ad-mafia-table');
  };

  const handlePrintTable = () => {
    if (typeof window === 'undefined') return;
    const { headerNames, matrix } = getExportPayload();
    const win = window.open('', '_blank', 'width=1060,height=740');
    if (!win) return;
    const esc = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const rowsHtml = matrix
      .map((row) => `<tr>${row.map((val) => `<td>${esc(val || '—')}</td>`).join('')}</tr>`)
      .join('');
    win.document.write(`<!doctype html><html><head><title>${esc(title || 'Ad Mafia Report')}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 28px; color: #0f172a; }
        h2 { margin: 0 0 6px 0; font-size: 18px; }
        p { margin: 0 0 18px 0; font-size: 12px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f1f5f9; text-align: left; padding: 9px 11px; border: 1px solid #cbd5e1; font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.03em; }
        td { padding: 8px 11px; border: 1px solid #e2e8f0; vertical-align: top; }
        tr:nth-child(even) td { background: #f8fafc; }
      </style></head><body>
      <h2>Ad Mafia — ${esc(title || 'Data Report')}</h2>
      <p>Generated ${esc(new Date().toLocaleString('en-IN'))} • ${processedRecords.length} record(s)</p>
      <table><thead><tr>${headerNames.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.onload = function(){ window.print(); };</script>
      </body></html>`);
    win.document.close();
  };

  const pageNumbers = [];
  const windowStart = Math.max(1, safePage - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const adjustedStart = Math.max(1, windowEnd - 4);
  for (let p = adjustedStart; p <= windowEnd; p += 1) {
    pageNumbers.push(p);
  }

  const activeColFilterCount = Object.values(colFilters).filter((v) => v && v.trim()).length;

  const emptyBlockNode =
    parsed.emptyPlaceholderRow && totalSourceCount === 0 ? (
      <div className="am-st-empty-card">
        {(() => {
          const singleTd = React.Children.toArray(parsed.emptyPlaceholderRow.props?.children)[0];
          return singleTd?.props?.children || 'No records found.';
        })()}
      </div>
    ) : (
      <div className="am-st-empty-card">
        No matching records found.{' '}
        {(quickSearch || activeColFilterCount > 0 || datePreset !== 'all') && (
          <button
            type="button"
            className="am-st-reset-link"
            onClick={() => {
              setQuickSearch('');
              setColFilters({});
              setDatePreset('all');
              setCustomFrom('');
              setCustomTo('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    );

  const classicGridNode = (
    <div className="am-st-scroll-viewport">
      {React.cloneElement(
        parsed.tableEl,
        {
          className: `${parsed.tableEl.props?.className || ''} am-st-enhanced-table`.trim(),
        },
        <>
          <thead>
            <tr>
              {visibleHeaders.map((h) => {
                const isSorted = sortState.colIdx === h.idx;
                const thProps = h.thElement.props || {};
                return React.cloneElement(
                  h.thElement,
                  {
                    key: h.idx,
                    className: `${thProps.className || ''} ${!h.isActionCol ? 'am-st-sortable-th' : ''} ${isSorted ? 'am-st-sorted-th' : ''}`.trim(),
                    onClick: (e) => {
                      if (typeof thProps.onClick === 'function') thProps.onClick(e);
                      handleToggleSort(h.idx, h.isActionCol);
                    },
                    style: {
                      ...(thProps.style || {}),
                      cursor: h.isActionCol ? 'default' : 'pointer',
                      userSelect: 'none',
                    },
                  },
                  <span className="am-st-th-inner">
                    <span>{thProps.children}</span>
                    {!h.isActionCol && (
                      <span className="am-st-sort-icon" aria-hidden="true">
                        {isSorted ? (
                          sortState.dir === 'asc' ? (
                            <ArrowUp size={12} />
                          ) : (
                            <ArrowDown size={12} />
                          )
                        ) : (
                          <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
                        )}
                      </span>
                    )}
                  </span>
                );
              })}
            </tr>

            {showColFilters && (
              <tr className="am-st-filter-row">
                {visibleHeaders.map((h) => (
                  <th key={`flt_${h.idx}`} className="am-st-filter-cell">
                    {!h.isActionCol ? (
                      <input
                        type="text"
                        value={colFilters[h.idx] || ''}
                        onChange={(e) => handleColFilterChange(h.idx, e.target.value)}
                        placeholder={`Filter ${h.label}...`}
                        className="am-st-col-filter-input"
                      />
                    ) : activeColFilterCount > 0 ? (
                      <button type="button" className="am-st-reset-link" onClick={handleClearColFilters}>
                        Reset
                      </button>
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>

          <tbody>
            {pagedRecords.length === 0 ? (
              parsed.emptyPlaceholderRow && totalSourceCount === 0 ? (
                parsed.emptyPlaceholderRow
              ) : (
                <tr>
                  <td
                    colSpan={visibleColCount}
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '0.86rem',
                    }}
                  >
                    No matching records found.{' '}
                    {(quickSearch || activeColFilterCount > 0) && (
                      <button
                        type="button"
                        className="am-st-reset-link"
                        onClick={() => {
                          setQuickSearch('');
                          setColFilters({});
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              )
            ) : (
              pagedRecords.map((rec) => {
                const visibleTds = visibleHeaders.map((h) => {
                  const td = rec.tdElements[h.idx];
                  return td ? React.cloneElement(td, { key: `td_${h.idx}` }) : <td key={`td_${h.idx}`}>—</td>;
                });
                const clonedPrimaryTr = React.cloneElement(
                  rec.trElement,
                  { key: rec.key },
                  visibleTds
                );
                if (rec.subRows.length === 0) return clonedPrimaryTr;
                return (
                  <React.Fragment key={rec.key}>
                    {clonedPrimaryTr}
                    {rec.subRows.map((sr, sIdx) => {
                      const srTdList = React.Children.toArray(sr.props?.children);
                      if (srTdList.length === 1 && React.isValidElement(srTdList[0])) {
                        return React.cloneElement(
                          sr,
                          { key: `${rec.key}_sub_${sIdx}` },
                          React.cloneElement(srTdList[0], { colSpan: visibleColCount })
                        );
                      }
                      return React.cloneElement(sr, { key: `${rec.key}_sub_${sIdx}` });
                    })}
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {parsed.tfootEl}
        </>
      )}
    </div>
  );

  const isMinimalMode = Boolean(minimal || isInsideModal);
  const showDateBar = Boolean(
    enableDateFilter && !isMinimalMode && parsed.dateColIndices?.length > 0 && totalSourceCount > 0
  );
  const hasViewCustomization =
    showColFilters ||
    activeColFilterCount > 0 ||
    compact ||
    Object.keys(hiddenCols).some((k) => hiddenCols[k]);

  return (
    <div ref={wrapRef} className={`am-smart-table-wrap ${compact ? 'am-st-compact' : ''} ${className}`}>
      {/* 1. CLEAN MINIMAL CONTROL BAR (Hidden on tiny modal tables) */}
      {(!isMinimalMode || totalSourceCount > 6) && (
        <div className="am-st-toolbar">
          <div className="am-st-toolbar-left">
            {showQuickSearchInput && (
              <div className="am-st-search-box">
                <Search size={14} className="am-st-search-ico" />
                <input
                  type="text"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={title ? `Search ${title}...` : 'Search records...'}
                  className="am-st-search-input"
                />
                {quickSearch && (
                  <button
                    type="button"
                    className="am-st-clear-btn"
                    onClick={() => setQuickSearch('')}
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {showDateBar && (
              <div className="am-st-date-strip" role="group" aria-label="Date range filter">
                {[
                  { id: 'all', label: 'All Dates' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: '7d', label: '7D' },
                  { id: '30d', label: '30D' },
                  { id: 'custom', label: 'Custom' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`am-st-date-pill ${datePreset === opt.id ? 'active' : ''}`}
                    onClick={() => setDatePreset(opt.id)}
                  >
                    {opt.id === 'custom' && <Calendar size={12} />}
                    <span>{opt.label}</span>
                  </button>
                ))}
                {datePreset === 'custom' && (
                  <div className="am-st-custom-dates">
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="am-st-date-input"
                      aria-label="From date"
                    />
                    <span className="am-st-date-sep">–</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="am-st-date-input"
                      aria-label="To date"
                    />
                  </div>
                )}
              </div>
            )}

            <span className="am-st-count-pill am-st-hide-sm">
              {totalFilteredCount} {totalFilteredCount === 1 ? 'record' : 'records'}
            </span>
          </div>

          {!isMinimalMode && (
            <div className="am-st-toolbar-right">
              <button
                type="button"
                className="am-st-btn"
                onClick={handleExportCsv}
                title="Export filtered rows to CSV"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>

              {/* Unified View & Column Options Menu */}
              <div className="am-st-col-menu-anchor" ref={colMenuRef}>
                <button
                  type="button"
                  className={`am-st-btn ${hasViewCustomization ? 'active' : ''}`}
                  onClick={() => setColMenuOpen((v) => !v)}
                  title="Display mode, column filters & visible columns"
                >
                  <SlidersHorizontal size={13} />
                  <span>View{activeColFilterCount > 0 ? ` (${activeColFilterCount})` : ''}</span>
                </button>
                {colMenuOpen && (
                  <div className="am-st-col-dropdown" style={{ minWidth: '235px' }}>
                    <div className="am-st-col-dropdown-head">
                      <span>Display &amp; Tools</span>
                      <button
                        type="button"
                        onClick={() => {
                          setHiddenCols({});
                          setColFilters({});
                          setShowColFilters(false);
                          setCompact(false);
                        }}
                        className="am-st-reset-link"
                      >
                        Reset
                      </button>
                    </div>

                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--am-border, #e2e8f0)', display: 'grid', gap: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          type="button"
                          className={`am-st-btn ${viewMode === 'tabulator' ? 'active' : ''}`}
                          style={{ justifyContent: 'center' }}
                          onClick={() => handleSwitchMode('tabulator')}
                        >
                          <Table2 size={13} /> <span>Table</span>
                        </button>
                        <button
                          type="button"
                          className={`am-st-btn ${viewMode === 'cards' ? 'active' : ''}`}
                          style={{ justifyContent: 'center' }}
                          onClick={() => handleSwitchMode('cards')}
                        >
                          <LayoutGrid size={13} /> <span>Cards</span>
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                          type="button"
                          className={`am-st-btn ${showColFilters ? 'active' : ''}`}
                          style={{ justifyContent: 'center' }}
                          onClick={() => setShowColFilters((v) => !v)}
                        >
                          <SlidersHorizontal size={12} /> <span>Col Filters</span>
                        </button>
                        <button
                          type="button"
                          className={`am-st-btn ${compact ? 'active' : ''}`}
                          style={{ justifyContent: 'center' }}
                          onClick={() => setCompact((v) => !v)}
                        >
                          <Rows3 size={12} /> <span>Compact</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        className="am-st-btn"
                        style={{ justifyContent: 'center', width: '100%' }}
                        onClick={() => {
                          setColMenuOpen(false);
                          handlePrintTable();
                        }}
                      >
                        <Printer size={12} /> <span>Print Report</span>
                      </button>
                    </div>

                    <div className="am-st-col-dropdown-head" style={{ borderTop: 'none' }}>
                      <span>Columns ({visibleHeaders.length}/{parsed.headers.length})</span>
                    </div>
                    <div className="am-st-col-dropdown-list">
                      {parsed.headers.map((h) => {
                        const checked = !hiddenCols[h.idx];
                        return (
                          <label key={h.idx} className="am-st-col-check-row">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={checked && visibleHeaders.length <= 1}
                              onChange={() =>
                                setHiddenCols((prev) => ({
                                  ...prev,
                                  [h.idx]: !prev[h.idx],
                                }))
                              }
                            />
                            <span>{h.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile Per-Column Filter Drawer when in Card Mode */}
      {showColFilters && viewMode === 'cards' && (
        <div className="am-st-mobile-col-filters">
          {visibleHeaders
            .filter((h) => !h.isActionCol)
            .map((h) => (
              <div key={h.idx} className="am-st-mobile-filter-item">
                <label>{h.label}</label>
                <input
                  type="text"
                  value={colFilters[h.idx] || ''}
                  onChange={(e) => handleColFilterChange(h.idx, e.target.value)}
                  placeholder={`Filter ${h.label}...`}
                />
              </div>
            ))}
          {activeColFilterCount > 0 && (
            <button
              type="button"
              className="am-st-btn"
              onClick={handleClearColFilters}
              style={{ alignSelf: 'flex-end' }}
            >
              Clear Column Filters
            </button>
          )}
        </div>
      )}

      {/* 2A. LIVE REACT-PORTAL TABULATOR v6 ENGINE */}
      {viewMode === 'tabulator' && (
        <TabulatorLiveGrid
          visibleHeaders={visibleHeaders}
          pagedRecords={pagedRecords}
          emptyNode={emptyBlockNode}
          sortState={sortState}
          onToggleSort={handleToggleSort}
          showColFilters={showColFilters}
          colFilters={colFilters}
          onColFilterChange={handleColFilterChange}
          onClearColFilters={handleClearColFilters}
          activeColFilterCount={activeColFilterCount}
          fallbackTableNode={classicGridNode}
        />
      )}

      {/* 2B. MOBILE-FIRST RESPONSIVE CARDS VIEW */}
      {viewMode === 'cards' && (
        <div className="am-st-cards-list">
          {totalFilteredCount > 1 && (
            <div className="am-st-mobile-sort-bar">
              <span>Sort by:</span>
              <select
                value={sortState.colIdx === null ? '' : String(sortState.colIdx)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') setSortState({ colIdx: null, dir: null });
                  else setSortState({ colIdx: Number(val), dir: sortState.dir || 'asc' });
                }}
              >
                <option value="">Default Order</option>
                {visibleHeaders
                  .filter((h) => !h.isActionCol)
                  .map((h) => (
                    <option key={h.idx} value={h.idx}>
                      {h.label}
                    </option>
                  ))}
              </select>
              {sortState.colIdx !== null && (
                <button
                  type="button"
                  className="am-st-btn"
                  onClick={() =>
                    setSortState((prev) => ({
                      ...prev,
                      dir: prev.dir === 'asc' ? 'desc' : 'asc',
                    }))
                  }
                >
                  {sortState.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              )}
            </div>
          )}

          {pagedRecords.length === 0 ? (
            emptyBlockNode
          ) : (
            pagedRecords.map((rec) => {
              const primaryCol = visibleHeaders[0];
              const statusCol = visibleHeaders.find((h, idx) => idx > 0 && h.isStatusCol);
              const actionCol = visibleHeaders.find(
                (h) => h.isActionCol || (h.idx === parsed.headers.length - 1 && rec.hasActionInLast)
              );
              const detailCols = visibleHeaders.filter(
                (h) => h !== primaryCol && h !== statusCol && h !== actionCol
              );

              return (
                <div key={rec.key} className="am-st-record-card">
                  <div className="am-st-record-card-head">
                    <div className="am-st-record-primary">
                      {primaryCol && rec.tdElements[primaryCol.idx]
                        ? rec.tdElements[primaryCol.idx].props?.children
                        : '—'}
                    </div>
                    {statusCol && rec.tdElements[statusCol.idx] && (
                      <div className="am-st-record-status">
                        {rec.tdElements[statusCol.idx].props?.children}
                      </div>
                    )}
                  </div>

                  {detailCols.length > 0 && (
                    <div className="am-st-record-grid">
                      {detailCols.map((col) => {
                        const td = rec.tdElements[col.idx];
                        if (!td) return null;
                        return (
                          <div key={col.idx} className="am-st-record-field">
                            <span className="am-st-record-label">{col.label}</span>
                            <div className="am-st-record-val">{td.props?.children}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {actionCol && rec.tdElements[actionCol.idx] && (
                    <div className="am-st-record-actions">
                      {rec.tdElements[actionCol.idx].props?.children}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 2C. CLASSIC SORTABLE HTML TABLE VIEW */}
      {viewMode === 'grid' && classicGridNode}

      {/* 3. UNIFIED PAGINATION & PAGE-SIZE FOOTER (ACTIVE ACROSS TABULATOR, CLASSIC & CARDS!) */}
      {totalSourceCount > 0 && (
        <div className="am-st-pagination-bar">
          <div className="am-st-page-info">
            <span>
              Showing{' '}
              <strong>{totalFilteredCount === 0 ? 0 : startIdx + 1}</strong>–
              <strong>
                {pageSize === 'all'
                  ? totalFilteredCount
                  : Math.min(startIdx + effectivePageSize, totalFilteredCount)}
              </strong>{' '}
              of <strong>{totalFilteredCount}</strong>
              {totalFilteredCount !== totalSourceCount
                ? ` (filtered from ${totalSourceCount})`
                : ''}
            </span>

            <label className="am-st-pagesize-label">
              <span>Rows:</span>
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  const val = e.target.value;
                  setPageSize(val === 'all' ? 'all' : Number(val));
                }}
                className="am-st-pagesize-select"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All ({totalFilteredCount})</option>
              </select>
            </label>
          </div>

          {pageSize !== 'all' && totalPages > 1 && (
            <div className="am-st-page-controls">
              <button
                type="button"
                className="am-st-page-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
                aria-label="First Page"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                className="am-st-page-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>

              {pageNumbers.map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  className={`am-st-page-btn ${pNum === safePage ? 'active' : ''}`}
                  onClick={() => setCurrentPage(pNum)}
                >
                  {pNum}
                </button>
              ))}

              <button
                type="button"
                className="am-st-page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next Page"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                className="am-st-page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                aria-label="Last Page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SmartTable;
