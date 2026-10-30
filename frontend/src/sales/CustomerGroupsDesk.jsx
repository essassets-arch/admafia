import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderTree,
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
  UserPlus,
  UserMinus,
  Check,
  X,
  ExternalLink,
  Phone,
  Mail,
  Building,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Filter,
} from 'lucide-react';
import crmApi from '../services/crmApi';

const DEFAULT_CATEGORIES = [
  'IT & Software',
  'Hardware & Computer Accessories',
  'Construction & Building Materials',
  'Manufacturing',
  'Digital Marketing',
  'Electrical Products',
  'Healthcare',
  'Other',
];

const ICONS_LIST = ['💻', '🖥️', '🏗️', '🏭', '📈', '⚡', '🏥', '🏢', '🛍️', '🚗', '🎓', '⚖️'];

export default function CustomerGroupsDesk({ customers = [], setCustomers }) {
  // Navigation & Sub-Views
  const [activeTab, setActiveTab] = useState('groups'); // 'groups' | 'memberships' | 'history'
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Group Create / Edit Modal
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    category: 'IT & Software',
    icon: '🏢',
    description: '',
    status: 'active',
  });

  // Customer Assignment State
  const [assignTargetGroup, setAssignTargetGroup] = useState('');
  const [selectedCustIds, setSelectedCustIds] = useState(new Set());
  const [custSearch, setCustSearch] = useState('');
  const [custCatFilter, setCustCatFilter] = useState('all');
  const [membershipsMap, setMembershipsMap] = useState({}); // { [groupId]: [cust1, cust2...] }

  // Lead Distribution Flow State (Sections 3, 4, 5)
  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [distributeStep, setDistributeStep] = useState(1); // 1 = Form, 2 = Preview, 3 = Completed
  const [distributeForm, setDistributeForm] = useState({
    groupId: '',
    title: '',
    description: '',
    category: 'IT & Software',
    requirement: '',
    budget: '₹1.5L – ₹3.5L',
    location: '',
    priority: 'Urgent',
    source: 'Direct Intake',
    deadlineDate: '',
    buyerName: 'Direct Buyer',
    buyerPhone: '9876543210',
    buyerEmail: '',
    city: '',
  });
  const [previewData, setPreviewData] = useState(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeSuccess, setDistributeSuccess] = useState(null);

  // Distribution History & Inspection (Section 7)
  const [historyList, setHistoryList] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [inspectModalOpen, setIsInspectModalOpen] = useState(false);
  const [inspectRecipients, setInspectRecipients] = useState([]);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Load Groups & Memberships from Database
  const fetchGroupsAndData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [fetchedGroups, history] = await Promise.all([
        crmApi.getGroups(),
        crmApi.getDistributionHistory(),
      ]);
      setGroups(fetchedGroups || []);
      setHistoryList(history || []);

      // Pre-fetch memberships for all groups to display badges
      if (Array.isArray(fetchedGroups)) {
        const memMap = {};
        for (const g of fetchedGroups) {
          try {
            const mems = await crmApi.getGroupMembers(g.id);
            memMap[g.id] = mems || [];
          } catch (e) {
            memMap[g.id] = [];
          }
        }
        setMembershipsMap(memMap);
      }
    } catch (err) {
      console.error('[CustomerGroupsDesk] Fetch error:', err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGroupsAndData();
  }, [fetchGroupsAndData]);

  // Dynamic KPI Metrics (Section 8)
  const totalGroups = groups.length;
  const activeCustomers = customers.filter((c) => c.status === 'active').length;
  const totalMasterLeads = historyList.length;
  const totalAssignments = historyList.reduce((acc, h) => acc + (h.totalRecipients || 0), 0);
  const totalInterested = historyList.reduce((acc, h) => acc + (h.interestedCount || 0), 0);
  const totalConverted = historyList.reduce((acc, h) => acc + (h.convertedCount || 0), 0);

  // Filtered Groups for Tab 1
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          g.name.toLowerCase().includes(q) ||
          (g.description || '').toLowerCase().includes(q) ||
          (g.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [groups, categoryFilter, statusFilter, search]);

  // Open Create Group Modal
  const handleOpenCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({
      name: '',
      category: 'IT & Software',
      icon: '🏢',
      description: '',
      status: 'active',
    });
    setIsGroupModalOpen(true);
  };

  // Open Edit Group Modal
  const handleOpenEditGroup = (grp) => {
    setEditingGroup(grp);
    setGroupForm({
      name: grp.name,
      category: grp.category || 'Other',
      icon: grp.icon || '🏢',
      description: grp.description || '',
      status: grp.status || 'active',
    });
    setIsGroupModalOpen(true);
  };

  // Save Group (Create / Update)
  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      showToast('Group name is required.', 'error');
      return;
    }
    try {
      if (editingGroup) {
        const updated = await crmApi.updateGroup(editingGroup.id, groupForm);
        setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        showToast(`Group "${updated.name}" updated successfully.`);
      } else {
        const created = await crmApi.createGroup(groupForm);
        setGroups((prev) => [...prev, created]);
        showToast(`Customer group "${created.name}" created.`);
      }
      setIsGroupModalOpen(false);
      fetchGroupsAndData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Toggle Group Status (Active / Inactive)
  const handleToggleGroupStatus = async (grp) => {
    const nextStatus = grp.status === 'active' ? 'inactive' : 'active';
    try {
      const updated = await crmApi.updateGroup(grp.id, { status: nextStatus });
      setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      showToast(`Group "${grp.name}" is now ${nextStatus}.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Group
  const handleDeleteGroup = async (grp) => {
    if (!window.confirm(`Are you sure you want to delete customer group "${grp.name}"? This will unassign all members from this group.`)) {
      return;
    }
    try {
      await crmApi.deleteGroup(grp.id);
      setGroups((prev) => prev.filter((g) => g.id !== grp.id));
      showToast(`Group "${grp.name}" deleted.`);
      fetchGroupsAndData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Filtered Customers for Tab 2
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (custCatFilter !== 'all' && c.category !== custCatFilter) return false;
      if (custSearch.trim()) {
        const q = custSearch.toLowerCase();
        return (
          (c.companyName || c.name || '').toLowerCase().includes(q) ||
          (c.contactPerson || c.contact || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.city || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [customers, custCatFilter, custSearch]);

  // Checkbox toggle for customer
  const toggleCustomerSelect = (id) => {
    setSelectedCustIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEligible = () => {
    if (selectedCustIds.size === filteredCustomers.length) {
      setSelectedCustIds(new Set());
    } else {
      setSelectedCustIds(new Set(filteredCustomers.map((c) => c.id)));
    }
  };

  // Batch Assign Selected Customers to Target Group
  const handleAssignSelected = async () => {
    if (!assignTargetGroup) {
      showToast('Please select a target customer group.', 'error');
      return;
    }
    if (selectedCustIds.size === 0) {
      showToast('Select at least one customer to assign.', 'error');
      return;
    }
    try {
      const res = await crmApi.assignCustomersToGroup(assignTargetGroup, Array.from(selectedCustIds));
      showToast(res.message || 'Customers assigned successfully.');
      setSelectedCustIds(new Set());
      fetchGroupsAndData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Remove customer from a group
  const handleRemoveMember = async (groupId, customerId, custName) => {
    if (!window.confirm(`Remove "${custName}" from this group?`)) return;
    try {
      await crmApi.removeCustomerFromGroup(groupId, customerId);
      showToast(`Removed "${custName}" from group.`);
      fetchGroupsAndData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Start Lead Distribution Flow
  const handleStartDistribute = (preselectedGroupId = null) => {
    const defaultGroup = preselectedGroupId
      ? groups.find((g) => g.id === preselectedGroupId) || groups[0]
      : groups[0];

    setDistributeForm({
      groupId: defaultGroup?.id || '',
      title: '',
      description: '',
      category: defaultGroup?.category || 'IT & Software',
      requirement: '',
      budget: '₹1.5L – ₹3.5L',
      location: 'Pan-India',
      priority: 'Urgent',
      source: 'Direct Intake',
      deadlineDate: '',
      buyerName: 'Verified Direct Buyer',
      buyerPhone: '9876543210',
      buyerEmail: 'buyer.enquiry@admafia.marketing',
      city: 'Mumbai',
    });
    setDistributeStep(1);
    setPreviewData(null);
    setDistributeSuccess(null);
    setIsDistributeModalOpen(true);
  };

  // Step 1 -> Step 2: Preview Distribution
  const handleProceedToPreview = async (e) => {
    e.preventDefault();
    if (!distributeForm.groupId) {
      showToast('Please select a target group.', 'error');
      return;
    }
    if (!distributeForm.title.trim()) {
      showToast('Lead title is required.', 'error');
      return;
    }
    if (!distributeForm.requirement.trim()) {
      showToast('Customer requirement is required.', 'error');
      return;
    }
    const cleanDigits = String(distributeForm.buyerPhone).replace(/\D/g, '').slice(-10);
    if (cleanDigits.length !== 10 || !['6', '7', '8', '9'].includes(cleanDigits[0])) {
      showToast('Buyer phone must be a 10-digit Indian mobile starting with 6, 7, 8, or 9.', 'error');
      return;
    }

    try {
      setIsDistributing(true);
      const preview = await crmApi.previewDistributionRecipients(distributeForm.groupId);
      setPreviewData(preview);
      setDistributeStep(2); // Jump to Preview
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsDistributing(false);
    }
  };

  // Step 2 -> Confirm & Distribute
  const handleConfirmDistribution = async () => {
    if (!previewData || previewData.eligibleCount === 0) {
      showToast('Cannot distribute: 0 eligible active customers in this group.', 'error');
      return;
    }
    try {
      setIsDistributing(true);
      const result = await crmApi.distributeLead(distributeForm);
      setDistributeSuccess(result);
      setDistributeStep(3);
      showToast(result.message);
      fetchGroupsAndData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsDistributing(false);
    }
  };

  // Inspect Distribution Details
  const handleInspectDistribution = async (historyItem) => {
    try {
      const details = await crmApi.getDistributionDetails(historyItem.id);
      setSelectedHistory(details.distribution);
      setInspectRecipients(details.recipients || []);
      setIsInspectModalOpen(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="desk-page-container">
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: notification.type === 'error' ? '#ef4444' : '#0f172a',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: '0.88rem',
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.15)',
            animation: 'modal-pop-in 0.2s ease',
          }}
        >
          {notification.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} color="#10b981" />}
          <span>{notification.msg}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', marginLeft: 8 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="desk-header">
        <div>
          <div className="desk-breadcrumb">ADMIN &amp; SUPPORT OPERATIONS / DESK 08</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 className="desk-title">Customer Groups &amp; Category-Based Lead Distribution</h1>
            <span
              style={{
                background: '#eef2ff',
                color: '#4338ca',
                border: '1px solid #c7d2fe',
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: '0.78rem',
                fontWeight: 800,
              }}
            >
              {groups.length} Configured Groups
            </span>
          </div>
          <p className="desk-subtitle">
            Manage commercial industry segments, batch customer group memberships, preview eligible recipients, and distribute single master leads to all assigned accounts with zero duplication.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={fetchGroupsAndData}
            disabled={refreshing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={handleOpenCreateGroup}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} />
            <span>+ Create Group</span>
          </button>
          <button
            type="button"
            className="sales-btn-primary"
            onClick={() => handleStartDistribute()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={14} />
            <span>🚀 Distribute Lead</span>
          </button>
        </div>
      </div>

      {/* KPI Quad Grid (Section 8) */}
      <div className="desk-kpi-grid">
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">TOTAL CUSTOMER GROUPS</div>
          <div className="desk-kpi-val text-indigo">{totalGroups}</div>
          <div className="desk-kpi-sub">Commercial industry verticals</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">ACTIVE CLIENT ACCOUNTS</div>
          <div className="desk-kpi-val text-emerald">{activeCustomers}</div>
          <div className="desk-kpi-sub">Enrolled in PostgreSQL</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">MASTER LEADS CREATED</div>
          <div className="desk-kpi-val text-indigo">{totalMasterLeads}</div>
          <div className="desk-kpi-sub">{totalAssignments} Total customer assignments</div>
        </div>
        <div className="desk-kpi-card">
          <div className="desk-kpi-label">CLIENT RESPONSE INTEREST</div>
          <div className="desk-kpi-val text-emerald">{totalInterested + totalConverted}</div>
          <div className="desk-kpi-sub">{totalConverted} Converted to sales</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="desk-filter-bar" style={{ marginTop: 20 }}>
        <div className="desk-tabs">
          <button
            type="button"
            className={`desk-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            <FolderTree size={14} style={{ marginRight: 6 }} /> Customer Groups ({groups.length})
          </button>
          <button
            type="button"
            className={`desk-tab ${activeTab === 'memberships' ? 'active' : ''}`}
            onClick={() => setActiveTab('memberships')}
          >
            <Users size={14} style={{ marginRight: 6 }} /> Customer Assignment &amp; Memberships
          </button>
          <button
            type="button"
            className={`desk-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={14} style={{ marginRight: 6 }} /> Lead Distribution History ({historyList.length})
          </button>
        </div>
      </div>

      {/* =========================================================================
         SUB-VIEW 1: CUSTOMER GROUPS MANAGEMENT (Section 1)
         ========================================================================= */}
      {activeTab === 'groups' && (
        <div style={{ marginTop: 16 }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search groups by name, category, description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="desk-form-input"
                  style={{ paddingLeft: 36, width: '100%' }}
                />
              </div>
              <select
                className="desk-form-input"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ maxWidth: 220 }}
              >
                <option value="all">All Categories</option>
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                className="desk-form-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ maxWidth: 160 }}
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          </div>

          {/* Groups Grid */}
          {filteredGroups.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', background: '#ffffff', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
              <FolderTree size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
              <h3 style={{ margin: 0, color: '#334155' }}>No customer groups found</h3>
              <p style={{ margin: '6px 0 16px', color: '#64748b', fontSize: '0.84rem' }}>
                Create a new customer group to start segmenting your accounts and distributing leads.
              </p>
              <button type="button" className="sales-btn-primary" onClick={handleOpenCreateGroup}>
                + Create First Group
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {filteredGroups.map((grp) => {
                const members = membershipsMap[grp.id] || [];
                const memberCount = grp.customerCount ?? members.length;
                const isActive = grp.status === 'active';

                return (
                  <div
                    key={grp.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 14,
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                      borderTop: `4px solid ${isActive ? '#4f46e5' : '#94a3b8'}`,
                    }}
                  >
                    <div>
                      {/* Top Row: Icon + Name + Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{grp.icon}</span>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                              {grp.name}
                            </h3>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#4338ca',
                                background: '#eef2ff',
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontWeight: 700,
                              }}
                            >
                              {grp.category || 'Other'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleGroupStatus(grp)}
                          title={`Click to ${isActive ? 'deactivate' : 'activate'}`}
                          style={{
                            border: 'none',
                            background: isActive ? '#ecfdf5' : '#f1f5f9',
                            color: isActive ? '#059669' : '#64748b',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {isActive ? '● Active' : '○ Inactive'}
                        </button>
                      </div>

                      {/* Description */}
                      <p style={{ margin: '12px 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45, minHeight: 36 }}>
                        {grp.description || 'No description configured for this group.'}
                      </p>

                      {/* Stat Badges */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 8,
                          padding: '10px 12px',
                          background: '#f8fafc',
                          borderRadius: 8,
                          fontSize: '0.76rem',
                          textAlign: 'center',
                          marginBottom: 14,
                        }}
                      >
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600 }}>Customers</div>
                          <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.05rem' }}>{memberCount}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600 }}>Leads Sent</div>
                          <div style={{ fontWeight: 900, color: '#4f46e5', fontSize: '1.05rem' }}>{grp.leadsReceived ?? 0}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontWeight: 600 }}>Dispatched</div>
                          <div style={{ fontWeight: 900, color: '#059669', fontSize: '1.05rem' }}>{grp.leadsDistributed ?? 0}</div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions Cluster */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          onClick={() => {
                            setAssignTargetGroup(grp.id);
                            setActiveTab('memberships');
                          }}
                          style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                          title="Manage assigned customers"
                        >
                          <Users size={13} /> {memberCount} Members
                        </button>
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          onClick={() => handleOpenEditGroup(grp)}
                          style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                          title="Edit Group"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          onClick={() => handleDeleteGroup(grp)}
                          style={{ padding: '5px 8px', fontSize: '0.74rem', color: '#dc2626' }}
                          title="Delete Group"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <button
                        type="button"
                        className="sales-btn-primary"
                        onClick={() => handleStartDistribute(grp.id)}
                        style={{ padding: '5px 12px', fontSize: '0.76rem', background: '#4f46e5' }}
                        title="Create & distribute lead to this group"
                      >
                        <Send size={12} /> Distribute
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
         SUB-VIEW 2: CUSTOMER ASSIGNMENT & MEMBERSHIPS (Section 2)
         ========================================================================= */}
      {activeTab === 'memberships' && (
        <div style={{ marginTop: 16 }}>
          {/* Assignment Toolbar */}
          <div
            style={{
              padding: 16,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Assign Customers to Groups
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  Select multiple registered customer accounts and batch-assign them to any group in 1 click. Accounts can belong to multiple groups.
                </p>
              </div>

              {/* Batch Action Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <select
                  className="desk-form-input"
                  value={assignTargetGroup}
                  onChange={(e) => setAssignTargetGroup(e.target.value)}
                  style={{ minWidth: 220 }}
                >
                  <option value="">-- Choose Target Group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.icon} {g.name} ({g.category})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="sales-btn-primary"
                  onClick={handleAssignSelected}
                  disabled={selectedCustIds.size === 0 || !assignTargetGroup}
                  style={{
                    opacity: selectedCustIds.size === 0 || !assignTargetGroup ? 0.6 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <UserPlus size={14} />
                  <span>Assign {selectedCustIds.size} Selected</span>
                </button>
              </div>
            </div>

            {/* Filter Row */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search customer by name, company, phone, email, city..."
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  className="desk-form-input"
                  style={{ paddingLeft: 34, width: '100%' }}
                />
              </div>

              <select
                className="desk-form-input"
                value={custCatFilter}
                onChange={(e) => setCustCatFilter(e.target.value)}
                style={{ maxWidth: 220 }}
              >
                <option value="all">All Industries / Categories</option>
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <button
                type="button"
                className="sales-btn-secondary"
                onClick={selectAllEligible}
                style={{ fontSize: '0.78rem' }}
              >
                {selectedCustIds.size === filteredCustomers.length && filteredCustomers.length > 0
                  ? 'Deselect All'
                  : `Select All (${filteredCustomers.length})`}
              </button>
            </div>
          </div>

          {/* Customers Table */}
          <div className="desk-table-container">
            <table className="desk-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedCustIds.size === filteredCustomers.length && filteredCustomers.length > 0}
                      onChange={selectAllEligible}
                    />
                  </th>
                  <th>Customer &amp; Company</th>
                  <th>Contact Details</th>
                  <th>Registered Category</th>
                  <th>Assigned Groups</th>
                  <th>Wallet &amp; Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                      No customers matched the search and category filters.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const isSelected = selectedCustIds.has(cust.id);
                    // Find all groups this customer belongs to
                    const assignedGroups = groups.filter((g) => {
                      const mems = membershipsMap[g.id] || [];
                      return mems.some((m) => m.id === cust.id || m.customerId === cust.id);
                    });

                    return (
                      <tr key={cust.id} style={{ background: isSelected ? '#f8faff' : 'inherit' }}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCustomerSelect(cust.id)}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>
                            {cust.companyName || cust.name}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            👤 {cust.contactPerson || cust.contact} • {cust.city || 'India'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600 }}>
                            <Phone size={12} color="#059669" /> +91 {cust.phone}
                          </div>
                          {cust.email && (
                            <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              ✉️ {cust.email}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.74rem',
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#f1f5f9',
                              color: '#334155',
                              fontWeight: 700,
                            }}
                          >
                            {cust.category || 'Other'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {assignedGroups.length === 0 ? (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                Not in any group
                              </span>
                            ) : (
                              assignedGroups.map((g) => (
                                <span
                                  key={g.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: '0.72rem',
                                    padding: '2px 6px',
                                    borderRadius: 6,
                                    background: '#eef2ff',
                                    color: '#4338ca',
                                    fontWeight: 700,
                                    border: '1px solid #c7d2fe',
                                  }}
                                >
                                  {g.icon} {g.name}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(g.id, cust.id, cust.companyName || cust.name)}
                                    title={`Remove from ${g.name}`}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      padding: '0 2px',
                                      fontSize: '0.75rem',
                                    }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 800, color: '#059669', fontSize: '0.82rem' }}>
                            ₹{(cust.balance || 0).toLocaleString('en-IN')}
                          </div>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: cust.status === 'active' ? '#ecfdf5' : '#fef2f2',
                              color: cust.status === 'active' ? '#059669' : '#dc2626',
                            }}
                          >
                            {cust.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="sales-btn-secondary"
                            onClick={() => toggleCustomerSelect(cust.id)}
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                          >
                            {isSelected ? '✓ Selected' : '+ Select'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
         SUB-VIEW 3: LEAD DISTRIBUTION HISTORY & TRACKING (Section 7)
         ========================================================================= */}
      {activeTab === 'history' && (
        <div style={{ marginTop: 16 }}>
          <div className="desk-table-container">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Lead Reference &amp; Title</th>
                  <th>Target Customer Group</th>
                  <th>Category</th>
                  <th>Distribution Date</th>
                  <th>Recipients</th>
                  <th>Client Responses</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {historyList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                      <Clock size={32} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 700 }}>No lead distributions logged yet.</div>
                      <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                        Click "🚀 Distribute Lead" above to broadcast a lead to any category group.
                      </div>
                    </td>
                  </tr>
                ) : (
                  historyList.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.title}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          Ref: <span style={{ fontFamily: 'monospace' }}>{item.id}</span> • Buyer: {item.buyerName} ({item.displayPhone})
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            background: '#eef2ff',
                            color: '#4338ca',
                            borderRadius: 6,
                          }}
                        >
                          {item.groupIcon || '🏢'} {item.groupName}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                          {item.category}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                          {new Date(item.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {new Date(item.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 900,
                            fontSize: '0.88rem',
                            color: '#059669',
                            background: '#ecfdf5',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {item.totalRecipients} Workspaces
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, fontSize: '0.74rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#059669', fontWeight: 800 }}>
                            {item.interestedCount} Interested
                          </span>
                          <span style={{ color: '#64748b' }}>•</span>
                          <span style={{ color: '#4f46e5', fontWeight: 700 }}>
                            {item.convertedCount} Converted
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="sales-btn-secondary"
                          onClick={() => handleInspectDistribution(item)}
                          style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={13} /> Inspect Status
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 1: CREATE / EDIT CUSTOMER GROUP (Section 1)
         ========================================================================= */}
      {isGroupModalOpen && (
        <div className="desk-modal-overlay">
          <div className="desk-modal-box" style={{ maxWidth: 540 }}>
            <div className="desk-modal-header">
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                {editingGroup ? `Edit Group: ${editingGroup.name}` : 'Create New Customer Group'}
              </h2>
              <button type="button" onClick={() => setIsGroupModalOpen(false)} className="desk-modal-close">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveGroup} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
              <div>
                <label className="desk-form-label">Group Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IT & Software, Hardware & Computer Accessories"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="desk-form-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label className="desk-form-label">Business Category *</label>
                  <select
                    className="desk-form-input"
                    value={groupForm.category}
                    onChange={(e) => setGroupForm({ ...groupForm, category: e.target.value })}
                  >
                    {DEFAULT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="desk-form-label">Icon</label>
                  <select
                    className="desk-form-input"
                    value={groupForm.icon}
                    onChange={(e) => setGroupForm({ ...groupForm, icon: e.target.value })}
                  >
                    {ICONS_LIST.map((ic) => (
                      <option key={ic} value={ic}>{ic} {ic}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="desk-form-label">Group Description</label>
                <textarea
                  rows={3}
                  placeholder="Explain the commercial scope and target accounts in this segment..."
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="desk-form-input"
                />
              </div>

              <div>
                <label className="desk-form-label">Status</label>
                <select
                  className="desk-form-input"
                  value={groupForm.status}
                  onChange={(e) => setGroupForm({ ...groupForm, status: e.target.value })}
                >
                  <option value="active">Active (Eligible for Lead Distribution)</option>
                  <option value="inactive">Inactive (Paused)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsGroupModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sales-btn-primary">
                  {editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 2: LEAD DISTRIBUTION WIZARD (Sections 3, 4, 5)
         ========================================================================= */}
      {isDistributeModalOpen && (
        <div className="desk-modal-overlay">
          <div className="desk-modal-box" style={{ maxWidth: 720 }}>
            <div className="desk-modal-header">
              <div>
                <span className="sales-dept-badge">
                  {distributeStep === 1 && 'Step 1: Lead Details'}
                  {distributeStep === 2 && 'Step 2: Recipient Preview & Verification'}
                  {distributeStep === 3 && 'Distribution Complete'}
                </span>
                <h2 style={{ margin: '4px 0 0', fontSize: '1.15rem', fontWeight: 800 }}>
                  Distribute Single Lead to All Group Customers
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDistributeModalOpen(false)}
                className="desk-modal-close"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: LEAD CREATION FORM */}
            {distributeStep === 1 && (
              <form onSubmit={handleProceedToPreview} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="desk-form-label">Target Customer Group *</label>
                    <select
                      required
                      className="desk-form-input"
                      value={distributeForm.groupId}
                      onChange={(e) => {
                        const sel = groups.find((g) => g.id === e.target.value);
                        setDistributeForm({
                          ...distributeForm,
                          groupId: e.target.value,
                          category: sel ? sel.category : distributeForm.category,
                        });
                      }}
                    >
                      <option value="">-- Choose Group --</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.icon} {g.name} ({g.customerCount ?? 0} Accounts)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="desk-form-label">Lead Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Cloud Server Migration & Networking Equipment Requirement"
                      value={distributeForm.title}
                      onChange={(e) => setDistributeForm({ ...distributeForm, title: e.target.value })}
                      className="desk-form-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="desk-form-label">Customer / Buyer Requirement Details *</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe specific products, quantities, specifications, and scope..."
                    value={distributeForm.requirement}
                    onChange={(e) => setDistributeForm({ ...distributeForm, requirement: e.target.value })}
                    className="desk-form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="desk-form-label">Est. Budget</label>
                    <input
                      type="text"
                      placeholder="e.g. ₹2.5L – ₹5.0L"
                      value={distributeForm.budget}
                      onChange={(e) => setDistributeForm({ ...distributeForm, budget: e.target.value })}
                      className="desk-form-input"
                    />
                  </div>
                  <div>
                    <label className="desk-form-label">Location / Market</label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai, Pune, Gujarat"
                      value={distributeForm.location}
                      onChange={(e) => setDistributeForm({ ...distributeForm, location: e.target.value })}
                      className="desk-form-input"
                    />
                  </div>
                  <div>
                    <label className="desk-form-label">Priority</label>
                    <select
                      className="desk-form-input"
                      value={distributeForm.priority}
                      onChange={(e) => setDistributeForm({ ...distributeForm, priority: e.target.value })}
                    >
                      <option value="Urgent">Urgent 🔥</option>
                      <option value="High">High</option>
                      <option value="Normal">Normal</option>
                    </select>
                  </div>
                </div>

                {/* Buyer Direct Contact Details */}
                <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                    Buyer Contact Information (Delivered to Customers)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="desk-form-label">Buyer Name *</label>
                      <input
                        type="text"
                        required
                        value={distributeForm.buyerName}
                        onChange={(e) => setDistributeForm({ ...distributeForm, buyerName: e.target.value })}
                        className="desk-form-input"
                      />
                    </div>
                    <div>
                      <label className="desk-form-label">10-Digit Mobile *</label>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="9876543210"
                        value={distributeForm.buyerPhone}
                        onChange={(e) => setDistributeForm({ ...distributeForm, buyerPhone: e.target.value })}
                        className="desk-form-input"
                      />
                    </div>
                    <div>
                      <label className="desk-form-label">Buyer Email</label>
                      <input
                        type="email"
                        placeholder="buyer@example.com"
                        value={distributeForm.buyerEmail}
                        onChange={(e) => setDistributeForm({ ...distributeForm, buyerEmail: e.target.value })}
                        className="desk-form-input"
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  <button
                    type="button"
                    className="sales-btn-secondary"
                    onClick={() => setIsDistributeModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="sales-btn-primary"
                    disabled={isDistributing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>Next: Review Recipients</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: PREVIEW CONFIRMATION SCREEN (Section 5) */}
            {distributeStep === 2 && previewData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                {/* Summary Card */}
                <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                        Distribution Target
                      </div>
                      <h3 style={{ margin: '2px 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                        {previewData.group.icon} {previewData.group.name} ({previewData.group.category})
                      </h3>
                      <div style={{ fontSize: '0.84rem', color: '#4338ca', fontWeight: 700, marginTop: 4 }}>
                        Lead: "{distributeForm.title}" • Budget: {distributeForm.budget}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 800 }}>
                        DISTRIBUTION SUMMARY
                      </div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                        Master Leads Created: <b style={{ color: '#4f46e5' }}>1</b>
                      </div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#059669' }}>
                        Customer Assignments: <b>{previewData.eligibleCount}</b>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Eligible Recipient Accounts List */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                      Eligible Recipient Workspaces ({previewData.eligibleCount}):
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>
                      ✓ Will be dispatched directly to each customer's CRM feed
                    </span>
                  </div>

                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table className="desk-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Recipient Account</th>
                          <th>Contact Person</th>
                          <th>Phone</th>
                          <th>City</th>
                          <th>Channel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.eligibleRecipients.map((rec, idx) => (
                          <tr key={rec.customerId || idx}>
                            <td style={{ fontWeight: 800, color: '#0f172a' }}>{rec.companyName}</td>
                            <td>{rec.contactPerson}</td>
                            <td>+91 {rec.phone}</td>
                            <td>{rec.city || 'India'}</td>
                            <td>
                              <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                                CRM Inbox ✓
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Excluded Accounts Warning */}
                {previewData.excludedCount > 0 && (
                  <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <AlertTriangle size={18} color="#d97706" />
                    <div style={{ fontSize: '0.78rem', color: '#92400e' }}>
                      <b>{previewData.excludedCount} account(s)</b> in this group are excluded because their status is suspended or inactive.
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    className="sales-btn-secondary"
                    onClick={() => setDistributeStep(1)}
                  >
                    ← Back to Edit
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="sales-btn-secondary"
                      onClick={() => setIsDistributeModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="sales-btn-primary"
                      onClick={handleConfirmDistribution}
                      disabled={isDistributing || previewData.eligibleCount === 0}
                      style={{ background: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {isDistributing ? (
                        <>
                          <RefreshCw size={14} className="spin-icon" />
                          <span>Dispatching...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Confirm &amp; Distribute to All {previewData.eligibleCount} Accounts</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: SUCCESS STATE */}
            {distributeStep === 3 && distributeSuccess && (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
                  <CheckCircle2 size={32} />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  Lead Successfully Broadcasted!
                </h3>
                <p style={{ margin: '8px auto', maxWidth: 500, color: '#475569', fontSize: '0.88rem' }}>
                  1 Master Lead created and securely assigned to <b>{distributeSuccess.recipientCount} customer accounts</b> in <b>{distributeSuccess.masterLead?.groupName}</b>.
                </p>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20 }}>
                  <button
                    type="button"
                    className="sales-btn-secondary"
                    onClick={() => {
                      setIsDistributeModalOpen(false);
                      setActiveTab('history');
                    }}
                  >
                    View Distribution Tracking
                  </button>
                  <button
                    type="button"
                    className="sales-btn-primary"
                    onClick={() => setIsDistributeModalOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 3: INSPECT RECIPIENT STATUS (Section 7)
         ========================================================================= */}
      {inspectModalOpen && selectedHistory && (
        <div className="desk-modal-overlay">
          <div className="desk-modal-box" style={{ maxWidth: 840 }}>
            <div className="desk-modal-header">
              <div>
                <span className="sales-dept-badge">Distribution Audit &amp; Recipient Inspector</span>
                <h2 style={{ margin: '4px 0 0', fontSize: '1.15rem', fontWeight: 800 }}>
                  "{selectedHistory.title}"
                </h2>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                  Ref: <span style={{ fontFamily: 'monospace' }}>{selectedHistory.id}</span> • Target Group: <b>{selectedHistory.groupName}</b> • Dispatched on {new Date(selectedHistory.createdAt).toLocaleString('en-IN')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInspectModalOpen(false)}
                className="desk-modal-close"
              >
                ✕
              </button>
            </div>

            {/* Recipient Details Table */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a' }}>
                  Recipient-Level Responses &amp; Status ({inspectRecipients.length}):
                </span>
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  Each customer responds independently in their CRM portal
                </span>
              </div>

              <div className="desk-table-container" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Recipient Account</th>
                      <th>Phone &amp; City</th>
                      <th>Lead Status</th>
                      <th>Client Response Interest</th>
                      <th>Customer Notes</th>
                      <th>Delivery Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectRecipients.map((rec) => (
                      <tr key={rec.id}>
                        <td>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{rec.companyName}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>👤 {rec.contactPerson}</div>
                        </td>
                        <td>
                          <div>+91 {rec.phone}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{rec.city || 'India'}</div>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: rec.status === 'Converted' ? '#ecfdf5' : '#f1f5f9',
                              color: rec.status === 'Converted' ? '#059669' : '#334155',
                            }}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background:
                                rec.responseInterest === 'Interested'
                                  ? '#ecfdf5'
                                  : rec.responseInterest === 'In Follow-up'
                                  ? '#eff6ff'
                                  : '#fffbeb',
                              color:
                                rec.responseInterest === 'Interested'
                                  ? '#059669'
                                  : rec.responseInterest === 'In Follow-up'
                                  ? '#1d4ed8'
                                  : '#b45309',
                            }}
                          >
                            {rec.responseInterest}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                            {rec.responseNotes || '—'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 700 }}>
                            Delivered ✓
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button
                  type="button"
                  className="sales-btn-primary"
                  onClick={() => setIsInspectModalOpen(false)}
                >
                  Close Audit Inspector
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

