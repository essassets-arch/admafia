import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  X,
  Building,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import crmApi from '../services/crmApi';

export default function CustomerGroupsDesk({ customers = [] }) {
  // Data States
  const [categoriesList, setCategoriesList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [search, setSearch] = useState('');

  // 1. Create Lead Modal State
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [leadForm, setLeadForm] = useState({
    category: '',
    contactNumber: '',
  });

  // Selected Category Live Recipient Preview in Create Lead Form
  const [previewRecipients, setPreviewRecipients] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 2. View Group Customers Modal State
  const [viewingGroup, setViewingGroup] = useState(null);
  const [viewingMembers, setViewingMembers] = useState([]);
  const [viewSearch, setViewSearch] = useState('');
  const [viewLoading, setViewLoading] = useState(false);

  // 3. Create / Edit Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    category: 'IT & Software',
    description: '',
  });

  // 4. Inspect Distribution History Modal State
  const [inspectItem, setInspectItem] = useState(null);
  const [inspectRecipients, setInspectRecipients] = useState([]);
  const [inspectLoading, setInspectLoading] = useState(false);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Fetch all categories, groups, and distribution history from PostgreSQL
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [cats, grps, hist] = await Promise.all([
        crmApi.getCategories().catch(() => []),
        crmApi.getGroups().catch(() => []),
        crmApi.getDistributionHistory().catch(() => []),
      ]);

      const safeCats = Array.isArray(cats) ? cats : [];
      const safeGrps = Array.isArray(grps) ? grps : [];
      const safeHist = Array.isArray(hist) ? hist : [];

      setCategoriesList(safeCats);
      setGroups(safeGrps);
      setHistoryList(safeHist);
    } catch (err) {
      console.error('[CustomerGroupsDesk] Fetch error:', err);
      showToast(err.message || 'Failed to load categories', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Combined options for the Target Category dropdown (from DB categories & groups)
  const categoryOptions = useMemo(() => {
    const map = new Map();

    // Add categories from categoriesList
    for (const c of categoriesList) {
      const key = c.category || c.name;
      if (key && !map.has(key)) {
        map.set(key, {
          category: key,
          name: c.name || key,
          groupId: c.groupId || null,
          eligibleCount: Number(c.eligibleCount || 0),
        });
      }
    }

    // Add groups if not already present
    for (const g of groups) {
      const key = g.category || g.name;
      if (key && !map.has(key)) {
        map.set(key, {
          category: key,
          name: g.name,
          groupId: g.id,
          eligibleCount: Number(g.customerCount || 0),
        });
      }
    }

    return Array.from(map.values());
  }, [categoriesList, groups]);

  // When category changes in Create Lead form, fetch live eligible customers preview
  useEffect(() => {
    if (!isCreateLeadOpen || !leadForm.category) {
      setPreviewRecipients([]);
      return;
    }

    let isMounted = true;
    setPreviewLoading(true);

    const selOption = categoryOptions.find((o) => o.category === leadForm.category);
    const targetGroupId = selOption?.groupId || '';

    crmApi
      .previewCategoryRecipients(leadForm.category, targetGroupId)
      .then((res) => {
        if (isMounted) {
          setPreviewRecipients(res.recipients || []);
        }
      })
      .catch((err) => {
        console.warn('[Preview error]:', err.message);
        if (isMounted) setPreviewRecipients([]);
      })
      .finally(() => {
        if (isMounted) setPreviewLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [leadForm.category, isCreateLeadOpen, categoryOptions]);

  // Filtered rows for the Category & Groups table
  const filteredRows = useMemo(() => {
    const list = categoryOptions.length > 0 ? categoryOptions : groups.map((g) => ({
      category: g.category || g.name,
      name: g.name,
      groupId: g.id,
      description: g.description,
      eligibleCount: Number(g.customerCount || 0),
    }));

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        (r.category || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [categoryOptions, groups, search]);

  // =========================================================================
  // ACTIONS: Create & Distribute Lead
  // =========================================================================
  const handleOpenCreateLead = (prefillCategory = '') => {
    const defaultCat = prefillCategory || (categoryOptions[0]?.category || 'IT & Software');
    setLeadForm({
      category: defaultCat,
      contactNumber: '',
    });
    setIsCreateLeadOpen(true);
  };

  const handleSubmitDistributeLead = async (e) => {
    e.preventDefault();

    if (!leadForm.category) {
      showToast('Please select a target category.', 'error');
      return;
    }

    const cleanPhone = String(leadForm.contactNumber || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || !['6', '7', '8', '9'].includes(cleanPhone[0])) {
      showToast('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.', 'error');
      return;
    }

    const selOption = categoryOptions.find((o) => o.category === leadForm.category);
    const eligibleCount = previewRecipients.length;

    if (eligibleCount === 0) {
      showToast(`Cannot distribute: 0 eligible customers in ${leadForm.category}.`, 'error');
      return;
    }

    try {
      setIsDistributing(true);
      const payload = {
        category: leadForm.category,
        groupId: selOption?.groupId || null,
        contactNumber: cleanPhone,
        buyerPhone: cleanPhone,
        title: `${leadForm.category} Buyer Requirement`,
        description: `Direct inbound requirement for ${leadForm.category} products and services.`,
        requirement: `Direct inbound requirement for ${leadForm.category} products and services.`,
        buyerName: 'Verified Buyer',
        priority: 'Normal',
        source: 'Category Lead Distribution',
      };

      const result = await crmApi.distributeLead(payload);
      const assignedCount = result.recipientsCount || result.recipientCount || eligibleCount;

      showToast(`Success! Distributed lead to ${assignedCount} customer${assignedCount === 1 ? '' : 's'} in "${leadForm.category}".`);
      setIsCreateLeadOpen(false);
      await fetchData();
    } catch (err) {
      console.error('[distributeLead error]:', err);
      showToast(err.message || 'Lead distribution failed', 'error');
    } finally {
      setIsDistributing(false);
    }
  };

  // =========================================================================
  // ACTIONS: View Group / Category Customers
  // =========================================================================
  const handleOpenViewCustomers = async (row) => {
    setViewingGroup(row);
    setViewSearch('');
    setViewLoading(true);
    try {
      const res = await crmApi.previewCategoryRecipients(row.category, row.groupId || '');
      setViewingMembers(res.recipients || []);
    } catch {
      setViewingMembers([]);
    } finally {
      setViewLoading(false);
    }
  };

  // =========================================================================
  // ACTIONS: Create / Edit Group
  // =========================================================================
  const handleOpenCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({
      name: '',
      category: 'IT & Software',
      description: '',
    });
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      showToast('Group name is required.', 'error');
      return;
    }

    try {
      if (editingGroup) {
        await crmApi.updateGroup(editingGroup.id, groupForm);
        showToast(`Group "${groupForm.name}" updated.`);
      } else {
        await crmApi.createGroup({ ...groupForm, status: 'active' });
        showToast(`Group "${groupForm.name}" created.`);
      }
      setIsGroupModalOpen(false);
      await fetchData();
    } catch (err) {
      showToast(err.message || 'Failed to save group', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: Inspect Distribution History Item
  // =========================================================================
  const handleInspectHistory = async (hItem) => {
    setInspectItem(hItem);
    setInspectLoading(true);
    try {
      const details = await crmApi.getDistributionDetails(hItem.id);
      setInspectRecipients(details.recipients || details.assignments || []);
    } catch {
      setInspectRecipients([]);
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="desk-page-container">
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 99999,
            padding: '12px 20px',
            borderRadius: 10,
            background: notification.type === 'error' ? '#ef4444' : '#10b981',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '0.9rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {notification.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* 1. Header Bar with Prominent Create Lead Action */}
      <div className="desk-header" style={{ marginBottom: 20, alignItems: 'flex-start' }}>
        <div>
          <h1 className="desk-title" style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Customer Groups &amp; Category Lead Distribution
          </h1>
          <p className="desk-subtitle" style={{ marginTop: 4, color: '#64748b', fontSize: '0.92rem' }}>
            Automatically distribute inbound leads to all matching customers in a category with one click.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={fetchData}
            disabled={refreshing}
            title="Refresh database records"
            style={{ padding: '9px 14px' }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span style={{ fontSize: '0.85rem' }}>Refresh</span>
          </button>

          <button
            type="button"
            className="sales-btn-secondary"
            onClick={handleOpenCreateGroup}
            style={{ padding: '9px 14px', fontSize: '0.85rem' }}
          >
            <Plus size={15} />
            <span>New Group</span>
          </button>

          {/* PROMINENT CREATE LEAD BUTTON */}
          <button
            type="button"
            className="sales-btn-primary"
            onClick={() => handleOpenCreateLead()}
            style={{
              padding: '10px 22px',
              fontSize: '0.92rem',
              fontWeight: 800,
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}
          >
            <Send size={16} strokeWidth={2.5} style={{ marginRight: 2 }} />
            <span>Create &amp; Distribute Lead</span>
          </button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
            }}
          />
          <input
            type="text"
            className="desk-search-input"
            placeholder="Search categories or groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: 40,
              paddingRight: 14,
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: '0.9rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
            }}
          />
        </div>
      </div>

      {/* 3. Categories & Customer Groups Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#4f46e5' }} />
          <p style={{ fontWeight: 600 }}>Loading customer categories from PostgreSQL...</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            border: '1px dashed #cbd5e1',
            borderRadius: 12,
            padding: '50px 20px',
            textAlign: 'center',
          }}
        >
          <Users size={44} style={{ margin: '0 auto 14px', color: '#94a3b8' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: '0 0 6px' }}>
            No categories found matching "{search}"
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0 0 16px' }}>
            Check your search terms or create a new customer group.
          </p>
        </div>
      ) : (
        <div
          className="desk-table-card"
          style={{
            background: '#ffffff',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            marginBottom: 28,
          }}
        >
          <table className="desk-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Target Category / Group
                </th>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Industry Scope
                </th>
                <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Eligible Customers
                </th>
                <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => {
                const count = row.eligibleCount ?? 0;
                return (
                  <tr
                    key={row.category + '_' + idx}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Category / Group Name */}
                    <td style={{ padding: '14px 18px' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: '#0f172a',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleOpenViewCustomers(row)}
                        title="Click to view matching eligible customers"
                      >
                        {row.name || row.category}
                      </div>
                      {row.description && (
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                          {row.description}
                        </div>
                      )}
                    </td>

                    {/* Industry Scope Badge */}
                    <td style={{ padding: '14px 18px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          backgroundColor: '#eef2ff',
                          color: '#4338ca',
                        }}
                      >
                        {row.category}
                      </span>
                    </td>

                    {/* Live Customer Count */}
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          backgroundColor: count > 0 ? '#ecfdf5' : '#f1f5f9',
                          color: count > 0 ? '#047857' : '#64748b',
                        }}
                      >
                        <Users size={13} />
                        {count} {count === 1 ? 'Customer' : 'Customers'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleOpenViewCustomers(row)}
                          className="sales-btn-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            borderRadius: 6,
                          }}
                          title="View eligible customers in this category"
                        >
                          <Eye size={13} style={{ marginRight: 4 }} />
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenCreateLead(row.category)}
                          className="sales-btn-primary"
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            borderRadius: 6,
                          }}
                          title={`Distribute a lead to all ${count} customer(s) in this category`}
                        >
                          <Send size={13} style={{ marginRight: 4 }} />
                          Distribute Lead
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Distribution History Section */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              Lead Distribution History
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
              Record of master leads distributed to customer categories.
            </p>
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
            {historyList.length} Total Distributions
          </span>
        </div>

        {historyList.length === 0 ? (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '24px 20px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.86rem',
            }}
          >
            No leads distributed yet. Click <strong>"Create &amp; Distribute Lead"</strong> above to dispatch your first category lead.
          </div>
        ) : (
          <div
            className="desk-table-card"
            style={{
              background: '#ffffff',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <table className="desk-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.8rem', color: '#475569' }}>
                    Lead Title &amp; Buyer
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.8rem', color: '#475569' }}>
                    Category
                  </th>
                  <th style={{ textAlign: 'center', padding: '10px 16px', fontSize: '0.8rem', color: '#475569' }}>
                    Recipients
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.8rem', color: '#475569' }}>
                    Date &amp; Time
                  </th>
                  <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: '0.8rem', color: '#475569' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {historyList.slice(0, 10).map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>{h.title}</div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        Buyer: {h.buyerName} • {h.displayPhone}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          backgroundColor: '#eef2ff',
                          color: '#4338ca',
                        }}
                      >
                        {h.category}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 14,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          backgroundColor: '#ecfdf5',
                          color: '#047857',
                        }}
                      >
                        {h.totalRecipients || 0} Accounts
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#64748b' }}>
                      {h.createdAt ? new Date(h.createdAt).toLocaleString('en-IN') : 'Recently'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleInspectHistory(h)}
                        className="sales-btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '0.76rem' }}
                      >
                        <Eye size={12} style={{ marginRight: 4 }} />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
         MODAL 1: CREATE & DISTRIBUTE LEAD (Simple, One-Click, Dynamic Preview)
         ========================================================================= */}
      {isCreateLeadOpen && (
        <div className="sales-modal-overlay" onClick={() => !isDistributing && setIsCreateLeadOpen(false)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480, width: '100%', borderRadius: 12, padding: 24 }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  Create &amp; Distribute Lead
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Save one lead and automatically distribute it to all eligible customers in the target category.
                </p>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                disabled={isDistributing}
                onClick={() => setIsCreateLeadOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitDistributeLead} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Target Category (Dynamic Dropdown from DB) */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                  Target Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  required
                  value={leadForm.category}
                  onChange={(e) => setLeadForm({ ...leadForm, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    backgroundColor: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  <option value="">-- Select Target Category --</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.category} value={opt.category}>
                      {opt.name} ({opt.eligibleCount} Eligible Accounts)
                    </option>
                  ))}
                </select>

                {/* Recipient Count & Confirmation Banner */}
                {leadForm.category && (
                  <div style={{ marginTop: 8 }}>
                    {previewLoading ? (
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Checking matching accounts...</div>
                    ) : previewRecipients.length > 0 ? (
                      <div
                        style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          color: '#15803d',
                          padding: '8px 12px',
                          borderRadius: 6,
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <CheckCircle2 size={16} />
                        <span>
                          Distribute this lead to {previewRecipients.length} eligible {leadForm.category} customer{previewRecipients.length === 1 ? '' : 's'}?
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          color: '#b91c1c',
                          padding: '8px 12px',
                          borderRadius: 6,
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <AlertTriangle size={16} />
                        <span>
                          0 eligible active customers found in {leadForm.category}. Lead cannot be distributed.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contact Number */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                  Contact Number <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit mobile number (e.g. 9876543210)"
                  value={leadForm.contactNumber}
                  onChange={(e) => setLeadForm({ ...leadForm, contactNumber: e.target.value.replace(/\D/g, '') })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.92rem',
                    letterSpacing: '0.5px',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                  Buyer contact number that will be visible to all recipient customers in this category.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  disabled={isDistributing}
                  onClick={() => setIsCreateLeadOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  disabled={isDistributing || previewRecipients.length === 0}
                  style={{ minWidth: 180 }}
                >
                  {isDistributing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Distributing...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Create &amp; Distribute
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 2: VIEW CATEGORY / GROUP CUSTOMERS
         ========================================================================= */}
      {viewingGroup && (
        <div className="sales-modal-overlay" onClick={() => setViewingGroup(null)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 660, width: '100%', borderRadius: 12, padding: 24 }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    {viewingGroup.name || viewingGroup.category}
                  </h3>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: '#eef2ff',
                      color: '#4338ca',
                    }}
                  >
                    {viewingGroup.category}
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Eligible customers in this category who will receive distributed leads.
                </p>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => setViewingGroup(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Customers */}
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Search customers by company, contact, or phone..."
                value={viewSearch}
                onChange={(e) => setViewSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                }}
              />
            </div>

            {/* List Table */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                overflow: 'hidden',
                maxHeight: 320,
                overflowY: 'auto',
              }}
            >
              {viewLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading customers...
                </div>
              ) : viewingMembers.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                  <Users size={32} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b' }}>
                    0 eligible customers found
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0' }}>
                    No active customers currently match this category.
                  </p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Company Name
                      </th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Contact Person
                      </th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Phone &amp; Email
                      </th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingMembers
                      .filter((m) => {
                        if (!viewSearch.trim()) return true;
                        const q = viewSearch.toLowerCase();
                        return (
                          (m.companyName || '').toLowerCase().includes(q) ||
                          (m.contactPerson || '').toLowerCase().includes(q) ||
                          (m.phone || '').includes(q)
                        );
                      })
                      .map((m) => (
                        <tr key={m.customerId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                            {m.companyName}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '0.8rem', color: '#475569' }}>
                            {m.contactPerson}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#334155' }}>
                            <div>{m.phone}</div>
                            {m.email && <div style={{ color: '#94a3b8' }}>{m.email}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 10,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                backgroundColor: '#ecfdf5',
                                color: '#047857',
                              }}
                            >
                              Eligible
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="sales-btn-secondary"
                onClick={() => setViewingGroup(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 3: CREATE / EDIT GROUP
         ========================================================================= */}
      {isGroupModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500, width: '100%', borderRadius: 12, padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                {editingGroup ? 'Edit Group' : 'Create Customer Group'}
              </h3>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => setIsGroupModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5 }}>
                  Group Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IT Customers"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5 }}>
                  Category *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IT & Software"
                  value={groupForm.category}
                  onChange={(e) => setGroupForm({ ...groupForm, category: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5 }}>
                  Description (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief note about the segment..."
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsGroupModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sales-btn-primary">
                  Save Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 4: INSPECT DISTRIBUTION HISTORY
         ========================================================================= */}
      {inspectItem && (
        <div className="sales-modal-overlay" onClick={() => setInspectItem(null)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 680, width: '100%', borderRadius: 12, padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  Distribution Inspection
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  {inspectItem.title} ({inspectItem.category})
                </p>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => setInspectItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
              {inspectLoading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading recipients...</div>
              ) : inspectRecipients.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No recipient records found.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Customer / Company
                      </th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Phone
                      </th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                        Response Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectRecipients.map((r, i) => (
                      <tr key={r.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                          {r.companyName || r.company_name || 'Customer'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '0.8rem', color: '#475569' }}>
                          {r.phone}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: r.responseInterest === 'Interested' ? '#ecfdf5' : '#f1f5f9',
                              color: r.responseInterest === 'Interested' ? '#047857' : '#64748b',
                            }}
                          >
                            {r.responseInterest || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="sales-btn-secondary"
                onClick={() => setInspectItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
