import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  Columns3,
  Download,
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
  X,
} from 'lucide-react';

/**
 * Recursively extracts clean human-readable text from any React node tree.
 */
export function extractNodeText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(extractNodeText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  if (React.isValidElement(node)) {
    const tag = typeof node.type === 'string' ? node.type.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'svg') return '';
    const childText = extractNodeText(node.props?.children);
    if (childText) return childText;
    if (typeof node.props?.value === 'string' || typeof node.props?.value === 'number') {
      return String(node.props.value);
    }
    if (typeof node.props?.title === 'string') return node.props.title;
    if (typeof node.props?.['aria-label'] === 'string') return node.props['aria-label'];
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

  // 1. Numeric / Currency / Percentage check (e.g., "₹6,000", "+₹2,400", "60%", "$120.50")
  const cleanNumA = a.replace(/[₹$€£,\s%+]/g, '').replace(/\/(day|mo|wk|month)$/i, '');
  const cleanNumB = b.replace(/[₹$€£,\s%+]/g, '').replace(/\/(day|mo|wk|month)$/i, '');
  if (
    /^-?\d+(\.\d+)?$/.test(cleanNumA) &&
    /^-?\d+(\.\d+)?$/.test(cleanNumB)
  ) {
    const numA = Number(cleanNumA);
    const numB = Number(cleanNumB);
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

/**
 * Native Tabulator v6 (`tabulator-tables`) Standalone Data Grid Component.
 * Ideal for dynamic schema-less datasets (e.g., Live MongoDB Document Explorer)
 * and powers the `⚡ Tabulator` interactive spreadsheet mode inside `<SmartTable />`.
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

  const serializedCols = useMemo(() => JSON.stringify(columns.map((c) => c.field + ':' + c.title)), [columns]);

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
          headerFilter: 'input',
          headerFilterPlaceholder: 'Filter...',
          minWidth: col.minWidth || 130,
          hozAlign: col.hozAlign || 'left',
          resizable: true,
          headerSort: true,
          formatter: 'plaintext',
        }));

        const table = new TabulatorFull(containerRef.current, {
          data: Array.isArray(data) ? data : [],
          columns: tabCols,
          layout: tabCols.length <= 6 ? 'fitColumns' : 'fitDataStretch',
          responsiveLayout: false,
          movableColumns: true,
          pagination: 'local',
          paginationSize: pageSize || 15,
          paginationSizeSelector: [10, 25, 50, 100],
          paginationCounter: 'rows',
          placeholder: 'No matching records in current view.',
          ...(height ? { maxHeight: height } : {}),
        });

        instanceRef.current = table;
        setReady(true);
      })
      .catch((err) => {
        console.warn('[TabulatorDataGrid] Failed to initialize Tabulator:', err);
      });

    return () => {
      cancelled = true;
      if (instanceRef.current) {
        try {
          instanceRef.current.destroy();
        } catch {}
        instanceRef.current = null;
      }
    };
  }, [serializedCols, pageSize, height]);

  useEffect(() => {
    if (ready && instanceRef.current && typeof instanceRef.current.replaceData === 'function') {
      try {
        instanceRef.current.replaceData(Array.isArray(data) ? data : []);
      } catch {}
    }
  }, [data, ready]);

  return (
    <div className="am-tabulator-native-shell">
      <div className="am-tabulator-native-subbar">
        <span className="am-tabulator-engine-badge">
          <Zap size={12} /> Tabulator v6 Engine • Drag columns to reorder • Resize edges • Per-column live filters
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="am-st-btn"
            onClick={() => {
              if (instanceRef.current) {
                instanceRef.current.download('csv', `${exportFilename}.csv`);
              }
            }}
          >
            <Download size={13} /> Tabulator CSV
          </button>
          <button
            type="button"
            className="am-st-btn"
            onClick={() => {
              if (instanceRef.current) {
                instanceRef.current.download('json', `${exportFilename}.json`);
              }
            }}
          >
            <Download size={13} /> JSON
          </button>
        </div>
      </div>
      <div ref={containerRef} className="am-tabulator-mount" />
    </div>
  );
}

/**
 * `<SmartTable>` — Drop-In Enterprise Table & Tabulator Wrapper.
 *
 * Wraps any React `<table>` (`<thead>` + `<tbody>`) while preserving 100% of live React JSX
 * buttons, modals, dropdowns, and event handlers, and automatically upgrades it with:
 *   1. Mobile-First Responsive Card Mode (`📱 Cards` default on <=768px) + `📊 Grid` + `⚡ Tabulator` v6 Mode
 *   2. Instant Quick Search + Toggleable Per-Column Header Filters (`Filters`)
 *   3. Click-Any-Column Multi-Type Sorting (`↑ Asc` / `↓ Desc` / `⇅ Reset`)
 *   4. Client Pagination (`10 / 25 / 50 / 100 / All` per page + First/Prev/Pages/Next/Last)
 *   5. Live Column Visibility Selector (`Columns ▾`), Density Toggle (`Compact`), CSV Export & Print
 */
export function SmartTable({
  children,
  title = '',
  defaultPageSize = 10,
  exportFilename = 'ad-mafia-records',
  enableSearch = true,
  defaultMobileView = 'cards', // 'cards' | 'grid'
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
    return 'grid';
  });
  const [userPickedMode, setUserPickedMode] = useState(false);

  const [quickSearch, setQuickSearch] = useState('');
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState({});
  const [sortState, setSortState] = useState({ colIdx: null, dir: null }); // dir: 'asc' | 'desc' | null
  const [hiddenCols, setHiddenCols] = useState({});
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const colMenuRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      const mob = window.innerWidth <= 768;
      setIsMobileScreen(mob);
      if (!userPickedMode) {
        setViewMode(mob && defaultMobileView === 'cards' ? 'cards' : 'grid');
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
        /action|manage|control|receipt|operation|quick|options/.test(lower) ||
        (idx === thElements.length - 1 && /view|edit|audit|verify|download|assign/.test(lower));
      const isStatusCol = /status|stage|state|verification|queue/.test(lower) && !isActionCol;
      return {
        idx,
        label,
        thElement: th,
        isActionCol,
        isStatusCol,
      };
    });

    const rawBodyRows = React.Children.toArray(tbodyEl.props?.children).filter(React.isValidElement);
    const dataRecords = [];
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
          // Expanded detail row belonging to previous primary row
          dataRecords[dataRecords.length - 1].subRows.push(tr);
        } else {
          emptyPlaceholderRow = tr;
        }
        continue;
      }

      const cellTexts = headers.map((_, cIdx) => extractNodeText(tdList[cIdx]?.props?.children));
      const hasActionInLast = hasInteractiveChild(tdList[tdList.length - 1]?.props?.children);

      dataRecords.push({
        originalIdx: rIdx,
        key: tr.key ?? `row_${rIdx}`,
        trElement: tr,
        tdElements: tdList,
        cellTexts,
        joinedSearchText: cellTexts.join(' ').toLowerCase(),
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
      dataRecords,
      emptyPlaceholderRow,
    };
  }, [children]);

  // Filter & Sort pipeline
  const processedRecords = useMemo(() => {
    if (!parsed.valid) return [];
    let list = parsed.dataRecords;

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
  }, [parsed, quickSearch, colFilters, sortState]);

  const totalSourceCount = parsed.valid ? parsed.dataRecords.length : 0;
  const totalFilteredCount = processedRecords.length;
  const effectivePageSize = pageSize === 'all' ? Math.max(1, totalFilteredCount) : Number(pageSize) || 10;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / effectivePageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [quickSearch, colFilters, pageSize, totalSourceCount]);

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

  const handleToggleSort = (colIdx, isActionCol) => {
    if (isActionCol) return;
    setSortState((prev) => {
      if (prev.colIdx !== colIdx) return { colIdx, dir: 'asc' };
      if (prev.dir === 'asc') return { colIdx, dir: 'desc' };
      return { colIdx: null, dir: null };
    });
  };

  const handleSwitchMode = (mode) => {
    setUserPickedMode(true);
    setViewMode(mode);
  };

  const handleExportCsv = () => {
    const exportCols = visibleHeaders.filter((h) => !h.isActionCol);
    const colsToUse = exportCols.length > 0 ? exportCols : visibleHeaders;
    const headerNames = colsToUse.map((h) => h.label);
    const matrix = processedRecords.map((rec) => colsToUse.map((h) => rec.cellTexts[h.idx] || ''));
    downloadCsvFile(headerNames, matrix, exportFilename || title || 'ad-mafia-table');
  };

  const handlePrintTable = () => {
    if (typeof window === 'undefined') return;
    const exportCols = visibleHeaders.filter((h) => !h.isActionCol);
    const colsToUse = exportCols.length > 0 ? exportCols : visibleHeaders;
    const win = window.open('', '_blank', 'width=1020,height=720');
    if (!win) return;
    const esc = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const rowsHtml = processedRecords
      .map(
        (rec) =>
          `<tr>${colsToUse
            .map((h) => `<td>${esc(rec.cellTexts[h.idx] || '—')}</td>`)
            .join('')}</tr>`
      )
      .join('');
    win.document.write(`<!doctype html><html><head><title>${esc(title || 'Ad Mafia Table Report')}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; }
        h2 { margin: 0 0 6px 0; font-size: 18px; }
        p { margin: 0 0 16px 0; font-size: 12px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #f1f5f9; text-align: left; padding: 8px 10px; border: 1px solid #cbd5e1; font-weight: 700; }
        td { padding: 7px 10px; border: 1px solid #e2e8f0; vertical-align: top; }
        tr:nth-child(even) td { background: #f8fafc; }
      </style></head><body>
      <h2>Ad Mafia — ${esc(title || 'Data Report')}</h2>
      <p>Generated ${esc(new Date().toLocaleString('en-IN'))} • ${processedRecords.length} record(s)</p>
      <table><thead><tr>${colsToUse.map((h) => `<th>${esc(h.label)}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.onload = function(){ window.print(); };</script>
      </body></html>`);
    win.document.close();
  };

  // Build Tabulator data when user selects `⚡ Tabulator` mode
  const tabulatorColumns = visibleHeaders
    .filter((h) => !h.isActionCol)
    .map((h) => ({
      title: h.label,
      field: `col_${h.idx}`,
    }));
  const tabulatorRows = processedRecords.map((rec, i) => {
    const obj = { id: rec.key || i };
    visibleHeaders.forEach((h) => {
      if (!h.isActionCol) {
        obj[`col_${h.idx}`] = rec.cellTexts[h.idx] || '—';
      }
    });
    return obj;
  });

  // Page numbers window
  const pageNumbers = [];
  const windowStart = Math.max(1, safePage - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const adjustedStart = Math.max(1, windowEnd - 4);
  for (let p = adjustedStart; p <= windowEnd; p += 1) {
    pageNumbers.push(p);
  }

  const activeColFilterCount = Object.values(colFilters).filter((v) => v && v.trim()).length;

  return (
    <div className={`am-smart-table-wrap ${compact ? 'am-st-compact' : ''} ${className}`}>
      {/* 1. ADVANCED TABULATOR CONTROL BAR */}
      <div className="am-st-toolbar">
        <div className="am-st-toolbar-left">
          {enableSearch && (
            <div className="am-st-search-box">
              <Search size={14} className="am-st-search-ico" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder={title ? `Filter ${title}...` : 'Quick search all columns...'}
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

          {/* View Mode Switcher: Mobile Cards | Interactive Grid | Native Tabulator */}
          <div className="am-st-mode-group" role="group" aria-label="Table Display Mode">
            <button
              type="button"
              className={`am-st-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('cards')}
              title="Mobile-Friendly Stacked Card View (with full action buttons)"
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              className={`am-st-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('grid')}
              title="Sortable Paginated Table Grid"
            >
              <Table2 size={13} />
              <span>Table</span>
            </button>
            <button
              type="button"
              className={`am-st-mode-btn ${viewMode === 'tabulator' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('tabulator')}
              title="Tabulator v6 Spreadsheet View (Drag/Resize Columns & Header Filters)"
            >
              <Zap size={13} />
              <span>Tabulator</span>
            </button>
          </div>
        </div>

        <div className="am-st-toolbar-right">
          {viewMode !== 'tabulator' && (
            <button
              type="button"
              className={`am-st-btn ${showColFilters || activeColFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setShowColFilters((v) => !v)}
              title="Toggle per-column filters"
            >
              <SlidersHorizontal size={13} />
              <span>Filters{activeColFilterCount > 0 ? ` (${activeColFilterCount})` : ''}</span>
            </button>
          )}

          {/* Column Visibility Dropdown */}
          <div className="am-st-col-menu-anchor" ref={colMenuRef}>
            <button
              type="button"
              className={`am-st-btn ${Object.keys(hiddenCols).some((k) => hiddenCols[k]) ? 'active' : ''}`}
              onClick={() => setColMenuOpen((v) => !v)}
              title="Show or hide columns"
            >
              <Columns3 size={13} />
              <span className="am-st-hide-xs">
                Columns ({visibleHeaders.length}/{parsed.headers.length})
              </span>
            </button>
            {colMenuOpen && (
              <div className="am-st-col-dropdown">
                <div className="am-st-col-dropdown-head">
                  <span>Visible Columns</span>
                  <button
                    type="button"
                    onClick={() => setHiddenCols({})}
                    className="am-st-reset-link"
                  >
                    Show All
                  </button>
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

          {viewMode === 'grid' && !isMobileScreen && (
            <button
              type="button"
              className={`am-st-btn ${compact ? 'active' : ''}`}
              onClick={() => setCompact((v) => !v)}
              title="Toggle compact row density"
            >
              <Rows3 size={13} />
              <span className="am-st-hide-sm">Compact</span>
            </button>
          )}

          <button
            type="button"
            className="am-st-btn"
            onClick={handleExportCsv}
            title="Export filtered rows to CSV"
          >
            <Download size={13} />
            <span>CSV</span>
          </button>

          <button
            type="button"
            className="am-st-btn am-st-hide-xs"
            onClick={handlePrintTable}
            title="Print clean table report"
          >
            <Printer size={13} />
          </button>
        </div>
      </div>

      {/* Optional Mobile Per-Column Filter Drawer when in Card Mode */}
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
                  onChange={(e) =>
                    setColFilters((prev) => ({ ...prev, [h.idx]: e.target.value }))
                  }
                  placeholder={`Filter ${h.label}...`}
                />
              </div>
            ))}
          {activeColFilterCount > 0 && (
            <button
              type="button"
              className="am-st-btn"
              onClick={() => setColFilters({})}
              style={{ alignSelf: 'flex-end' }}
            >
              Clear Column Filters
            </button>
          )}
        </div>
      )}

      {/* 2A. NATIVE TABULATOR v6 SPREADSHEET VIEW */}
      {viewMode === 'tabulator' && (
        <TabulatorDataGrid
          columns={tabulatorColumns}
          data={tabulatorRows}
          pageSize={pageSize === 'all' ? 50 : Number(pageSize) || 15}
          exportFilename={exportFilename}
        />
      )}

      {/* 2B. MOBILE-FIRST RESPONSIVE CARDS VIEW (WITH LIVE REACT BUTTONS!) */}
      {viewMode === 'cards' && (
        <div className="am-st-cards-list">
          {/* Mobile Sort Bar */}
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
            <div className="am-st-empty-card">
              {parsed.emptyPlaceholderRow
                ? extractNodeText(parsed.emptyPlaceholderRow) || 'No records found.'
                : 'No matching records found for your current search/filters.'}
            </div>
          ) : (
            pagedRecords.map((rec) => {
              const primaryCol = visibleHeaders[0];
              const statusCol = visibleHeaders.find(
                (h, idx) => idx > 0 && h.isStatusCol
              );
              const actionCol = visibleHeaders.find(
                (h) => h.isActionCol || (h.idx === parsed.headers.length - 1 && rec.hasActionInLast)
              );
              const detailCols = visibleHeaders.filter(
                (h) =>
                  h !== primaryCol &&
                  h !== statusCol &&
                  h !== actionCol
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

                  {rec.subRows.length > 0 && (
                    <div className="am-st-record-subrows">
                      {rec.subRows.map((sr, sIdx) => {
                        const srTd = React.Children.toArray(sr.props?.children)[0];
                        return (
                          <div key={sIdx} className="am-st-record-subrow-inner">
                            {srTd?.props?.children}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 2C. SORTABLE, FILTERABLE, PAGINATED REACT TABLE GRID */}
      {viewMode === 'grid' && (
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
                            onChange={(e) =>
                              setColFilters((prev) => ({
                                ...prev,
                                [h.idx]: e.target.value,
                              }))
                            }
                            placeholder={`Filter...`}
                            className="am-st-col-filter-input"
                          />
                        ) : activeColFilterCount > 0 ? (
                          <button
                            type="button"
                            className="am-st-reset-link"
                            onClick={() => setColFilters({})}
                          >
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
      )}

      {/* 3. PAGINATION & PAGE-SIZE FOOTER */}
      {viewMode !== 'tabulator' && totalSourceCount > 0 && (
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
