import React, { StrictMode, useState, useEffect, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ComponentContext, IComponent, getStudioProApi } from "@mendix/extensions-api";
import type {
    ExtensionMessage,
    ExtensionResponse,
    UnusedItem,
    ElementCategory,
    DeleteItemRef,
} from "../main/index";

// ── Types ──────────────────────────────────────────────────────────────────────
type SortKey = "name" | "category" | "subType" | "moduleName";
type SortDir = "asc" | "desc";
type Status = "idle" | "scanning" | "deleting" | "done";

// ── Light Mode Styles Injected at Runtime ───────────────────────────────────────
const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #f8fafc;
    --surface:      #ffffff;
    --surface-hover:#f1f5f9;
    --surface-alt:  #f8fafc;
    --border:       #e2e8f0;
    --border-strong:#cbd5e1;
    
    --primary:      #2563eb;
    --primary-h:    #1d4ed8;
    --primary-light:#eff6ff;
    --primary-border:#bfdbfe;

    --danger:       #dc2626;
    --danger-h:     #b91c1c;
    --danger-light: #fef2f2;
    --danger-border:#fecaca;

    --success:      #16a34a;
    --success-light:#f0fdf4;
    --success-border:#bbf7d0;

    --warning:      #d97706;
    --warning-light:#fffbeb;
    --warning-border:#fde68a;

    --purple:       #7c3aed;
    --purple-light: #f5f3ff;
    --purple-border:#ddd6fe;

    --text:         #0f172a;
    --text-secondary:#334155;
    --text-muted:   #64748b;
    --text-dim:     #94a3b8;

    --radius-lg:    12px;
    --radius-md:    8px;
    --radius-sm:    6px;
    --shadow-sm:    0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md:    0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    --shadow-lg:    0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
  }

  body {
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  #root {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .header {
    padding: 16px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    box-shadow: var(--shadow-sm);
  }

  .header-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);
    flex-shrink: 0;
  }

  .header-text h1 {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.01em;
  }

  .header-text p {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .header-spacer { flex: 1; }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-stat-badge {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .header-stat-badge.active {
    background: var(--primary-light);
    border-color: var(--primary-border);
    color: var(--primary-h);
  }

  /* ── Toolbar ── */
  .toolbar {
    padding: 12px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  /* Category Filter Pills */
  .category-tabs {
    display: flex;
    align-items: center;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 3px;
    gap: 3px;
  }

  .category-tab {
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .category-tab:hover {
    color: var(--text);
  }

  .category-tab.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .category-count {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 10px;
    background: #e2e8f0;
    color: #475569;
  }

  .category-tab.active .category-count {
    background: var(--primary-light);
    color: var(--primary-h);
  }

  .search-wrap {
    position: relative;
    flex: 1;
    min-width: 200px;
  }

  .search-icon {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    font-size: 14px;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: 13px;
    padding: 8px 12px 8px 34px;
    outline: none;
    transition: all 0.15s;
    font-family: inherit;
  }

  .search-input:focus {
    background: var(--surface);
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .search-input::placeholder { color: var(--text-dim); }

  .filter-select {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    outline: none;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .filter-select:focus {
    border-color: var(--primary);
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    padding: 8px 16px;
    transition: all 0.15s;
    white-space: nowrap;
    user-select: none;
  }

  .btn-primary {
    background: var(--primary);
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--primary-h);
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.4);
  }
  .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

  .btn-danger {
    background: var(--danger);
    color: #ffffff;
    box-shadow: 0 1px 3px rgba(220, 38, 38, 0.3);
  }
  .btn-danger:hover:not(:disabled) {
    background: var(--danger-h);
    box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
  }
  .btn-danger:disabled { opacity: 0.55; cursor: not-allowed; }

  .btn-outline {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    color: var(--text-secondary);
  }
  .btn-outline:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text);
    border-color: var(--primary);
  }
  .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Status Bar ── */
  .status-bar {
    padding: 7px 24px;
    background: var(--surface-alt);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    min-height: 36px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-strong);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .status-tag {
    font-weight: 600;
  }
  .status-tag.success { color: var(--success); }
  .status-tag.danger  { color: var(--danger); }

  .selection-helpers {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }
  .link-btn:hover {
    text-decoration: underline;
  }

  /* ── Table Area ── */
  .table-wrap {
    flex: 1;
    overflow: auto;
    background: var(--surface);
  }

  .table-wrap::-webkit-scrollbar { width: 8px; height: 8px; }
  .table-wrap::-webkit-scrollbar-track { background: var(--bg); }
  .table-wrap::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
  .table-wrap::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  thead tr {
    background: #f1f5f9;
  }

  th {
    padding: 11px 16px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-strong);
    white-space: nowrap;
    user-select: none;
  }

  th.sortable { cursor: pointer; }
  th.sortable:hover { color: var(--text); }
  th.sorted { color: var(--primary); }
  th .sort-arrow { margin-left: 4px; font-size: 11px; }

  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
    background: var(--surface);
  }

  tbody tr:hover {
    background: #f8fafc;
  }

  tbody tr.selected {
    background: #eff6ff;
  }

  td {
    padding: 10px 16px;
    font-size: 13px;
    vertical-align: middle;
    color: var(--text);
  }

  td.cb-col {
    width: 44px;
    text-align: center;
  }

  .item-name-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-name-text {
    font-weight: 600;
    color: var(--text);
  }

  .item-context-text {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Custom Checkbox */
  .custom-cb {
    width: 17px;
    height: 17px;
    border-radius: 4px;
    border: 1.5px solid var(--border-strong);
    appearance: none;
    -webkit-appearance: none;
    background: var(--surface);
    cursor: pointer;
    position: relative;
    transition: all 0.15s;
    display: inline-block;
    vertical-align: middle;
  }

  .custom-cb:hover {
    border-color: var(--primary);
  }

  .custom-cb:checked {
    background: var(--primary);
    border-color: var(--primary);
  }

  .custom-cb:checked::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 2px;
    width: 4px;
    height: 8px;
    border: solid #ffffff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  /* Badges for Categories */
  .cat-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid transparent;
  }

  .cat-badge.Entity {
    background: var(--purple-light);
    color: var(--purple);
    border-color: var(--purple-border);
  }

  .cat-badge.Attribute {
    background: var(--success-light);
    color: var(--success);
    border-color: var(--success-border);
  }

  .cat-badge.Association {
    background: var(--warning-light);
    color: var(--warning);
    border-color: var(--warning-border);
  }

  .cat-badge.Document {
    background: var(--primary-light);
    color: var(--primary-h);
    border-color: var(--primary-border);
  }

  .sub-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: #f1f5f9;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 500;
  }

  .module-tag {
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* ── Empty & State Cards ── */
  .state-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 24px;
    text-align: center;
  }

  .state-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin-bottom: 16px;
  }

  .state-icon.info {
    background: var(--primary-light);
    color: var(--primary);
  }

  .state-icon.clean {
    background: var(--success-light);
    color: var(--success);
  }

  .state-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 6px;
  }

  .state-desc {
    font-size: 13px;
    color: var(--text-muted);
    max-width: 440px;
    line-height: 1.5;
    margin-bottom: 20px;
  }

  /* ── Modal ── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 20px;
  }

  .modal-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 480px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    animation: popIn 0.15s ease-out;
  }

  @keyframes popIn {
    from { transform: scale(0.96); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .modal-header {
    padding: 20px 24px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .modal-icon-danger {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--danger-light);
    color: var(--danger);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  .modal-title h2 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }

  .modal-title p {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .modal-body {
    padding: 0 24px 20px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .modal-summary-box {
    margin-top: 12px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }

  .modal-summary-row {
    display: flex;
    justify-content: space-between;
    color: var(--text-muted);
  }

  .modal-summary-row span:last-child {
    font-weight: 600;
    color: var(--text);
  }

  .modal-footer {
    padding: 14px 24px;
    background: var(--surface-alt);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
`;

// ── Main UI Component ─────────────────────────────────────────────────────────
function DeleteUnusedApp({ studioPro }: { studioPro: ReturnType<typeof getStudioProApi> }) {
    const [items, setItems] = useState<UnusedItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [status, setStatus] = useState<Status>("idle");
    const [statusMessage, setStatusMessage] = useState<string>("Ready to scan.");

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<"ALL" | ElementCategory>("ALL");
    const [moduleFilter, setModuleFilter] = useState("ALL");
    const [sortKey, setSortKey] = useState<SortKey>("category");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    // Confirmation Modal
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Initial scan on mount
    useEffect(() => {
        handleScan();
    }, []);

    // ── Scanning ─────────────────────────────────────────────────────────────
    const handleScan = useCallback(async () => {
        setStatus("scanning");
        setStatusMessage("Scanning domain models and project documents for unused elements...");
        setSelectedIds(new Set());

        try {
            const resp = await new Promise<ExtensionResponse>((resolve) => {
                studioPro.ui.messagePassing.sendMessage<ExtensionMessage, ExtensionResponse>(
                    { type: "scan" },
                    async (r: ExtensionResponse) => {
                        resolve(r);
                    }
                );
            });

            if (resp.type === "scanResult") {
                setItems(resp.items);
                setStatus("done");
                setStatusMessage(`Scan completed: found ${resp.items.length} unused element(s).`);
            }
        } catch (err: any) {
            console.error("[DeleteUnused UI] Scan error:", err);
            setStatus("idle");
            setStatusMessage("Scan failed. Check the Studio Pro console for details.");
        }
    }, [studioPro]);

    // ── Deleting ─────────────────────────────────────────────────────────────
    const handleDeleteSelected = useCallback(async () => {
        setShowDeleteModal(false);
        const selectedList = items.filter((item) => selectedIds.has(item.id));
        if (selectedList.length === 0) return;

        setStatus("deleting");
        setStatusMessage(`Deleting ${selectedList.length} element(s)...`);

        const deletePayload: DeleteItemRef[] = selectedList.map((item) => ({
            id: item.id,
            category: item.category,
            domainModelId: item.domainModelId,
            targetId: item.targetId,
            propertyName: item.propertyName,
            isCross: item.isCross,
        }));

        try {
            const resp = await new Promise<ExtensionResponse>((resolve) => {
                studioPro.ui.messagePassing.sendMessage<ExtensionMessage, ExtensionResponse>(
                    {
                        type: "delete",
                        items: deletePayload,
                        ids: Array.from(selectedIds),
                    },
                    async (r: ExtensionResponse) => {
                        resolve(r);
                    }
                );
            });

            if (resp.type === "deleteResult") {
                const deletedSet = new Set(selectedIds);
                setItems((prev) => prev.filter((i) => !deletedSet.has(i.id)));
                setSelectedIds(new Set());
                setStatus("done");
                setStatusMessage(`Successfully deleted ${resp.deletedCount} element(s).`);
            }
        } catch (err: any) {
            console.error("[DeleteUnused UI] Delete error:", err);
            setStatus("idle");
            setStatusMessage("Delete failed. Check the Studio Pro console for details.");
        }
    }, [studioPro, items, selectedIds]);

    // ── Filtering and Sorting ────────────────────────────────────────────────
    const modules = useMemo(() => {
        const set = new Set<string>();
        items.forEach((item) => set.add(item.moduleName));
        return Array.from(set).sort();
    }, [items]);

    const countsByCategory = useMemo(() => {
        const counts: Record<string, number> = { ALL: items.length, Entity: 0, Attribute: 0, Association: 0, Document: 0 };
        for (const item of items) {
            if (counts[item.category] !== undefined) {
                counts[item.category]++;
            }
        }
        return counts;
    }, [items]);

    const filteredItems = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return items.filter((item) => {
            if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
            if (moduleFilter !== "ALL" && item.moduleName !== moduleFilter) return false;
            if (q) {
                const nameMatch = item.name.toLowerCase().includes(q);
                const subTypeMatch = item.subType.toLowerCase().includes(q);
                const moduleMatch = item.moduleName.toLowerCase().includes(q);
                const containerMatch = item.containerName?.toLowerCase().includes(q) ?? false;
                if (!nameMatch && !subTypeMatch && !moduleMatch && !containerMatch) return false;
            }
            return true;
        });
    }, [items, categoryFilter, moduleFilter, searchQuery]);

    const sortedItems = useMemo(() => {
        return [...filteredItems].sort((a, b) => {
            let cmp = 0;
            if (sortKey === "name") cmp = a.name.localeCompare(b.name);
            else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
            else if (sortKey === "subType") cmp = a.subType.localeCompare(b.subType);
            else if (sortKey === "moduleName") cmp = a.moduleName.localeCompare(b.moduleName);

            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [filteredItems, sortKey, sortDir]);

    // Selection Handlers
    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllVisible = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            sortedItems.forEach((item) => next.add(item.id));
            return next;
        });
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const isAllVisibleSelected =
        sortedItems.length > 0 && sortedItems.every((item) => selectedIds.has(item.id));

    const toggleSelectAllVisible = () => {
        if (isAllVisibleSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                sortedItems.forEach((item) => next.delete(item.id));
                return next;
            });
        } else {
            selectAllVisible();
        }
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    // Selected Items Category breakdown for modal
    const selectedBreakdown = useMemo(() => {
        const counts = { Entity: 0, Attribute: 0, Association: 0, Document: 0 };
        for (const item of items) {
            if (selectedIds.has(item.id)) {
                counts[item.category]++;
            }
        }
        return counts;
    }, [items, selectedIds]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* ── Header ── */}
            <div className="header">
                <div className="header-icon">🧹</div>
                <div className="header-text">
                    <h1>Unused Elements Finder</h1>
                    <p>Clean up unused domain model entities, attributes, associations, and documents</p>
                </div>
                <div className="header-spacer" />
                <div className="header-badges">
                    <span className="header-stat-badge">
                        Total Unused: <strong>{items.length}</strong>
                    </span>
                    <span className={`header-stat-badge ${selectedIds.size > 0 ? "active" : ""}`}>
                        Selected: <strong>{selectedIds.size}</strong>
                    </span>
                </div>
                <button
                    className="btn btn-outline"
                    onClick={handleScan}
                    disabled={status === "scanning" || status === "deleting"}
                >
                    {status === "scanning" ? <span className="spinner" /> : "↻"}
                    Scan Project
                </button>
                <button
                    className="btn btn-danger"
                    onClick={() => setShowDeleteModal(true)}
                    disabled={selectedIds.size === 0 || status === "deleting"}
                >
                    {status === "deleting" ? <span className="spinner" /> : "🗑"}
                    Delete Selected ({selectedIds.size})
                </button>
            </div>

            {/* ── Toolbar ── */}
            <div className="toolbar">
                {/* Category Tabs */}
                <div className="category-tabs">
                    {(["ALL", "Entity", "Attribute", "Association", "Document"] as const).map((cat) => (
                        <button
                            key={cat}
                            className={`category-tab ${categoryFilter === cat ? "active" : ""}`}
                            onClick={() => setCategoryFilter(cat)}
                        >
                            {cat === "ALL" ? "All Elements" : `${cat}s`}
                            <span className="category-count">{countsByCategory[cat] ?? 0}</span>
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="search-wrap">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search by name, entity, module..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Module Filter */}
                <select
                    className="filter-select"
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                >
                    <option value="ALL">All Modules ({modules.length})</option>
                    {modules.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>
            </div>

            {/* ── Status Bar ── */}
            <div className="status-bar">
                {status === "scanning" || status === "deleting" ? (
                    <span className="spinner" />
                ) : (
                    <span style={{ fontSize: "14px" }}>ℹ</span>
                )}
                <span>{statusMessage}</span>

                {sortedItems.length > 0 && (
                    <div className="selection-helpers">
                        <button className="link-btn" onClick={selectAllVisible}>
                            Select All Visible ({sortedItems.length})
                        </button>
                        <span>•</span>
                        <button className="link-btn" onClick={clearSelection}>
                            Clear Selection
                        </button>
                    </div>
                )}
            </div>

            {/* ── Table Content ── */}
            <div className="table-wrap">
                {items.length === 0 && status !== "scanning" ? (
                    <div className="state-card">
                        <div className="state-icon clean">✓</div>
                        <div className="state-title">No Unused Elements Detected</div>
                        <div className="state-desc">
                            Your user modules are clean! Every entity, attribute, association, and document is currently in use.
                        </div>
                        <button className="btn btn-outline" onClick={handleScan}>
                            Re-Scan Project
                        </button>
                    </div>
                ) : sortedItems.length === 0 && items.length > 0 ? (
                    <div className="state-card">
                        <div className="state-icon info">🔍</div>
                        <div className="state-title">No Matching Elements</div>
                        <div className="state-desc">
                            No elements matched your current search or category filter. Try clearing the filter or search term.
                        </div>
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                setSearchQuery("");
                                setCategoryFilter("ALL");
                                setModuleFilter("ALL");
                            }}
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th className="cb-col">
                                    <input
                                        type="checkbox"
                                        className="custom-cb"
                                        checked={isAllVisibleSelected}
                                        onChange={toggleSelectAllVisible}
                                        title="Select/Deselect All Visible"
                                    />
                                </th>
                                <th
                                    className={`sortable ${sortKey === "name" ? "sorted" : ""}`}
                                    onClick={() => handleSort("name")}
                                >
                                    Element Name {sortKey === "name" && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                                </th>
                                <th
                                    className={`sortable ${sortKey === "category" ? "sorted" : ""}`}
                                    onClick={() => handleSort("category")}
                                >
                                    Category {sortKey === "category" && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                                </th>
                                <th
                                    className={`sortable ${sortKey === "subType" ? "sorted" : ""}`}
                                    onClick={() => handleSort("subType")}
                                >
                                    Type {sortKey === "subType" && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                                </th>
                                <th
                                    className={`sortable ${sortKey === "moduleName" ? "sorted" : ""}`}
                                    onClick={() => handleSort("moduleName")}
                                >
                                    Module {sortKey === "moduleName" && <span className="sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedItems.map((item) => {
                                const isSelected = selectedIds.has(item.id);
                                return (
                                    <tr
                                        key={item.id}
                                        className={isSelected ? "selected" : ""}
                                        onClick={() => toggleSelect(item.id)}
                                        style={{ cursor: "pointer" }}
                                    >
                                        <td className="cb-col" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="custom-cb"
                                                checked={isSelected}
                                                onChange={() => toggleSelect(item.id)}
                                            />
                                        </td>
                                        <td>
                                            <div className="item-name-cell">
                                                <span className="item-name-text">{item.name}</span>
                                                {item.containerName && (
                                                    <span className="item-context-text">{item.containerName}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`cat-badge ${item.category}`}>{item.category}</span>
                                        </td>
                                        <td>
                                            <span className="sub-badge">{item.subType}</span>
                                        </td>
                                        <td>
                                            <span className="module-tag">{item.moduleName}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Confirmation Modal ── */}
            {showDeleteModal && (
                <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-icon-danger">⚠️</div>
                            <div className="modal-title">
                                <h2>Confirm Deletion</h2>
                                <p>This will permanently remove the selected elements from your Mendix project.</p>
                            </div>
                        </div>

                        <div className="modal-body">
                            <p>Are you sure you want to delete the selected <strong>{selectedIds.size}</strong> element(s)?</p>

                            <div className="modal-summary-box">
                                {selectedBreakdown.Entity > 0 && (
                                    <div className="modal-summary-row">
                                        <span>Domain Model Entities:</span>
                                        <span>{selectedBreakdown.Entity}</span>
                                    </div>
                                )}
                                {selectedBreakdown.Attribute > 0 && (
                                    <div className="modal-summary-row">
                                        <span>Domain Model Attributes:</span>
                                        <span>{selectedBreakdown.Attribute}</span>
                                    </div>
                                )}
                                {selectedBreakdown.Association > 0 && (
                                    <div className="modal-summary-row">
                                        <span>Domain Model Associations:</span>
                                        <span>{selectedBreakdown.Association}</span>
                                    </div>
                                )}
                                {selectedBreakdown.Document > 0 && (
                                    <div className="modal-summary-row">
                                        <span>Standalone Documents:</span>
                                        <span>{selectedBreakdown.Document}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowDeleteModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={handleDeleteSelected}>
                                Yes, Delete {selectedIds.size} Element(s)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Extension Component Definition ──────────────────────────────────────────
export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        // Inject styles once into document head
        const styleId = "delete-unused-elements-light-theme";
        if (!document.getElementById(styleId)) {
            const styleEl = document.createElement("style");
            styleEl.id = styleId;
            styleEl.innerHTML = STYLE;
            document.head.appendChild(styleEl);
        }

        const studioPro = getStudioProApi(componentContext);
        const rootEl = document.getElementById("root");
        if (rootEl) {
            const root = createRoot(rootEl);
            root.render(
                <StrictMode>
                    <DeleteUnusedApp studioPro={studioPro} />
                </StrictMode>
            );
        }
    },
};
