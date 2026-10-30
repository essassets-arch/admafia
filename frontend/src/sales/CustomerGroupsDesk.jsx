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
  UserPlus,
  UserMinus,
  X,
  Building,
  Phone,
  Mail,
  MapPin,
  Check,
} from 'lucide-react';
import crmApi from '../services/crmApi';

const PREDEFINED_CATEGORIES = [
  'IT & Software',
  'Hardware',
  'Construction & Building Materials',
  'Manufacturing',
  'Digital Marketing',
  'Electrical Products',
  'Healthcare',
  'Other',
];

export default function CustomerGroupsDesk({ customers = [] }) {
  // Groups State
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [search, setSearch] = useState('');

  // Memberships Map: { [groupId]: [cust1, cust2...] }
  const [membershipsMap, setMembershipsMap] = useState({});

  // 1. Create / Edit Group Modal State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    category: 'IT & Software',
    description: '',
  });
  const [selectedCustIdsForGroup, setSelectedCustIdsForGroup] = useState(new Set());
  const [custModalSearch, setCustModalSearch] = useState('');

  // 2. View / Manage Customers Modal State
  const [viewingGroup, setViewingGroup] = useState(null);
  const [viewMemberSearch, setViewMemberSearch] = useState('');
  const [addMembersSelectedIds, setAddMembersSelectedIds] = useState(new Set());
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [isAddingMembersOpen, setIsAddingMembersOpen] = useState(false);

  // 3. Compact Distribute Lead Modal State
  const [distributeGroup, setDistributeGroup] = useState(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeForm, setDistributeForm] = useState({
    title: '',
    requirement: '',
    buyerName: '',
    buyerPhone: '',
    buyerEmail: '',
    budget: '',
    location: '',
    priority: 'Urgent',
  });

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Fetch groups and their member counts from backend
  const fetchGroupsAndMembers = useCallback(async () => {
    try {
      setRefreshing(true);
      const fetchedGroups = await crmApi.getGroups();
      const safeGroups = Array.isArray(fetchedGroups) ? fetchedGroups : [];
      setGroups(safeGroups);

      // Fetch live memberships for each group
      const memMap = {};
      await Promise.all(
        safeGroups.map(async (g) => {
          try {
            const mems = await crmApi.getGroupMembers(g.id);
            memMap[g.id] = mems || [];
          } catch {
            memMap[g.id] = [];
          }
        })
      );
      setMembershipsMap(memMap);
    } catch (err) {
      console.error('[CustomerGroupsDesk] Fetch error:', err);
      showToast(err.message || 'Failed to load groups', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGroupsAndMembers();
  }, [fetchGroupsAndMembers]);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) => {
      const gName = (g.name || '').toLowerCase();
      const gCat = (g.category || '').toLowerCase();
      const gDesc = (g.description || '').toLowerCase();
      return gName.includes(q) || gCat.includes(q) || gDesc.includes(q);
    });
  }, [groups, search]);

  // All available customers (from props, normalized)
  const allCustomers = useMemo(() => {
    return (customers || []).map((c) => ({
      id: c.id,
      name: c.companyName || c.name || c.contactPerson || 'Customer Account',
      company: c.companyName || c.name || 'Company',
      contact: c.contactPerson || c.contact || c.username || 'Contact',
      phone: c.phone || '',
      email: c.email || '',
      category: c.category || c.businessCategory || 'General',
      status: c.status || 'active',
    }));
  }, [customers]);

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
    setSelectedCustIdsForGroup(new Set());
    setCustModalSearch('');
    setIsGroupModalOpen(true);
  };

  const handleOpenEditGroup = (grp) => {
    setEditingGroup(grp);
    setGroupForm({
      name: grp.name || '',
      category: grp.category || 'IT & Software',
      description: grp.description || '',
    });
    // Pre-populate already assigned members
    const currentMembers = membershipsMap[grp.id] || [];
    const assignedIds = new Set(currentMembers.map((m) => m.id || m.customer_id));
    setSelectedCustIdsForGroup(assignedIds);
    setCustModalSearch('');
    setIsGroupModalOpen(true);
  };

  const handleToggleCustomerForGroup = (custId) => {
    setSelectedCustIdsForGroup((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) {
        next.delete(custId);
      } else {
        next.add(custId);
      }
      return next;
    });
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      showToast('Group name is required.', 'error');
      return;
    }

    try {
      let savedGroup;
      if (editingGroup) {
        savedGroup = await crmApi.updateGroup(editingGroup.id, {
          name: groupForm.name.trim(),
          category: groupForm.category,
          description: groupForm.description,
          status: editingGroup.status || 'active',
        });
        showToast(`Group "${savedGroup.name}" updated successfully.`);
      } else {
        savedGroup = await crmApi.createGroup({
          name: groupForm.name.trim(),
          category: groupForm.category,
          description: groupForm.description,
          status: 'active',
        });
        showToast(`Customer group "${savedGroup.name}" created.`);
      }

      // Assign selected customers if any
      const targetGroupId = savedGroup.id || (editingGroup && editingGroup.id);
      if (targetGroupId) {
        const selectedArr = Array.from(selectedCustIdsForGroup);
        if (selectedArr.length > 0) {
          await crmApi.assignCustomersToGroup(targetGroupId, selectedArr);
        }
      }

      setIsGroupModalOpen(false);
      await fetchGroupsAndMembers();
    } catch (err) {
      console.error('[handleSaveGroup] Error:', err);
      showToast(err.message || 'Failed to save group', 'error');
    }
  };

  const handleDeleteGroup = async (grp) => {
    if (!window.confirm(`Are you sure you want to delete the group "${grp.name}"?`)) {
      return;
    }
    try {
      await crmApi.deleteGroup(grp.id);
      showToast(`Group "${grp.name}" deleted.`);
      await fetchGroupsAndMembers();
      if (viewingGroup && viewingGroup.id === grp.id) {
        setViewingGroup(null);
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete group', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: View / Manage Customers
  // =========================================================================
  const handleOpenViewMembers = async (grp) => {
    setViewingGroup(grp);
    setViewMemberSearch('');
    setIsAddingMembersOpen(false);
    setAddMembersSelectedIds(new Set());
    setAddMemberSearch('');

    // Ensure member data is fresh
    try {
      const freshMems = await crmApi.getGroupMembers(grp.id);
      setMembershipsMap((prev) => ({ ...prev, [grp.id]: freshMems || [] }));
    } catch {
      // ignore
    }
  };

  const handleRemoveMember = async (groupId, customerId, custName) => {
    if (!window.confirm(`Remove "${custName}" from this group?`)) return;
    try {
      await crmApi.removeCustomerFromGroup(groupId, customerId);
      showToast(`Removed "${custName}" from group.`);
      const freshMems = await crmApi.getGroupMembers(groupId);
      setMembershipsMap((prev) => ({ ...prev, [groupId]: freshMems || [] }));
      // Also update customer count in groups state
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, customerCount: Math.max(0, (freshMems || []).length) } : g
        )
      );
    } catch (err) {
      showToast(err.message || 'Failed to remove customer', 'error');
    }
  };

  const handleAddSelectedMembersToGroup = async () => {
    if (!viewingGroup) return;
    const toAdd = Array.from(addMembersSelectedIds);
    if (toAdd.length === 0) {
      showToast('Select at least one customer to add.', 'error');
      return;
    }

    try {
      await crmApi.assignCustomersToGroup(viewingGroup.id, toAdd);
      showToast(`Added ${toAdd.length} customer${toAdd.length === 1 ? '' : 's'} to ${viewingGroup.name}.`);
      setAddMembersSelectedIds(new Set());
      setIsAddingMembersOpen(false);
      const freshMems = await crmApi.getGroupMembers(viewingGroup.id);
      setMembershipsMap((prev) => ({ ...prev, [viewingGroup.id]: freshMems || [] }));
      setGroups((prev) =>
        prev.map((g) =>
          g.id === viewingGroup.id ? { ...g, customerCount: (freshMems || []).length } : g
        )
      );
    } catch (err) {
      showToast(err.message || 'Failed to add customers', 'error');
    }
  };

  // =========================================================================
  // ACTIONS: Distribute Lead (Single Step Compact Modal)
  // =========================================================================
  const handleOpenDistributeLead = (grp) => {
    setDistributeGroup(grp);
    setDistributeForm({
      title: '',
      requirement: '',
      buyerName: 'Verified Buyer',
      buyerPhone: '',
      buyerEmail: '',
      budget: '',
      location: '',
      priority: 'Urgent',
    });
  };

  const handleDistributeSubmit = async (e) => {
    e.preventDefault();
    if (!distributeGroup) return;

    const currentMembers = membershipsMap[distributeGroup.id] || [];
    if (currentMembers.length === 0) {
      showToast('Cannot distribute: This group currently has 0 customers assigned.', 'error');
      return;
    }

    if (!distributeForm.title.trim()) {
      showToast('Lead title is required.', 'error');
      return;
    }
    if (!distributeForm.requirement.trim()) {
      showToast('Lead requirement details are required.', 'error');
      return;
    }
    const cleanPhone = String(distributeForm.buyerPhone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || !['6', '7', '8', '9'].includes(cleanPhone[0])) {
      showToast('Please enter a valid 10-digit buyer mobile number (starting with 6, 7, 8, or 9).', 'error');
      return;
    }

    try {
      setIsDistributing(true);
      const payload = {
        groupId: distributeGroup.id,
        title: distributeForm.title.trim(),
        description: distributeForm.requirement.trim(),
        category: distributeGroup.category || 'IT & Software',
        requirement: distributeForm.requirement.trim(),
        budget: distributeForm.budget.trim() || '₹1,00,000 – ₹3,00,000',
        location: distributeForm.location.trim() || 'Pan India',
        priority: distributeForm.priority,
        source: 'Admin Direct Distribution',
        buyerName: distributeForm.buyerName.trim() || 'Direct Buyer',
        buyerPhone: cleanPhone,
        buyerEmail: distributeForm.buyerEmail.trim(),
        city: distributeForm.location.trim() || 'India',
      };

      const result = await crmApi.distributeLead(payload);
      const count = result.recipientsCount || result.assignedCount || currentMembers.length;
      showToast(`Success! Lead distributed to ${count} customer${count === 1 ? '' : 's'} in "${distributeGroup.name}".`);
      setDistributeGroup(null);
      await fetchGroupsAndMembers();
    } catch (err) {
      console.error('[handleDistributeSubmit] Error:', err);
      showToast(err.message || 'Lead distribution failed', 'error');
    } finally {
      setIsDistributing(false);
    }
  };

  // Helper for live customer count
  const getCustomerCount = (grp) => {
    if (membershipsMap[grp.id]) {
      return membershipsMap[grp.id].length;
    }
    return Number(grp.customerCount || 0);
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

      {/* 1. Simple Header */}
      <div className="desk-header" style={{ marginBottom: 20, alignItems: 'flex-start' }}>
        <div>
          <h1 className="desk-title" style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
            Customer Groups
          </h1>
          <p className="desk-subtitle" style={{ marginTop: 4, color: '#64748b', fontSize: '0.92rem' }}>
            Organize customers by industry and distribute relevant leads.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="sales-btn-secondary"
            onClick={fetchGroupsAndMembers}
            disabled={refreshing}
            title="Refresh groups"
            style={{ padding: '9px 14px' }}
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span style={{ fontSize: '0.85rem' }}>Refresh</span>
          </button>

          <button
            type="button"
            className="sales-btn-primary"
            onClick={handleOpenCreateGroup}
            style={{ padding: '9px 18px', fontSize: '0.88rem' }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>+ Create Group</span>
          </button>
        </div>
      </div>

      {/* 2. Search Groups Bar */}
      <div style={{ marginBottom: 18 }}>
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
            placeholder="Search groups..."
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

      {/* 3. Simple Table Interface */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#4f46e5' }} />
          <p style={{ fontWeight: 600 }}>Loading customer groups...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
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
            {search ? 'No groups match your search' : 'No customer groups configured yet'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0 0 20px' }}>
            {search
              ? 'Try adjusting your search terms.'
              : 'Create your first group to start organizing customers and distributing category leads.'}
          </p>
          {!search && (
            <button
              type="button"
              className="sales-btn-primary"
              onClick={handleOpenCreateGroup}
              style={{ display: 'inline-flex', padding: '10px 20px' }}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Create Group</span>
            </button>
          )}
        </div>
      ) : (
        <div className="desk-table-card" style={{ background: '#ffffff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <table className="desk-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Group Name
                </th>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Category
                </th>
                <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Customers
                </th>
                <th style={{ textAlign: 'right', padding: '12px 18px', fontWeight: 700, fontSize: '0.82rem', color: '#475569' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((grp) => {
                const count = getCustomerCount(grp);
                return (
                  <tr
                    key={grp.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Group Name */}
                    <td style={{ padding: '14px 18px' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.94rem',
                          color: '#0f172a',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleOpenViewMembers(grp)}
                        title="Click to view and manage assigned customers"
                      >
                        {grp.name}
                      </div>
                      {grp.description && (
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                          {grp.description}
                        </div>
                      )}
                    </td>

                    {/* Category */}
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
                        {grp.category || 'Other'}
                      </span>
                    </td>

                    {/* Customers Count */}
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
                          onClick={() => handleOpenViewMembers(grp)}
                          className="sales-btn-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            borderRadius: 6,
                          }}
                          title="View & manage group customers"
                        >
                          <Eye size={13} style={{ marginRight: 4 }} />
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditGroup(grp)}
                          className="sales-btn-secondary"
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            borderRadius: 6,
                          }}
                          title="Edit group details"
                        >
                          <Edit2 size={13} style={{ marginRight: 4 }} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDistributeLead(grp)}
                          className="sales-btn-primary"
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            borderRadius: 6,
                          }}
                          title={`Distribute a lead to all ${count} customers in this group`}
                        >
                          <Send size={13} style={{ marginRight: 4 }} />
                          Distribute Lead
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(grp)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: '6px 8px',
                            borderRadius: 6,
                            transition: 'color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                          title="Delete group"
                        >
                          <Trash2 size={15} />
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

      {/* =========================================================================
         MODAL 1: CREATE / EDIT GROUP
         ========================================================================= */}
      {isGroupModalOpen && (
        <div className="sales-modal-overlay" onClick={() => setIsGroupModalOpen(false)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 560, width: '100%', borderRadius: 12, padding: 24 }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {editingGroup ? 'Edit Customer Group' : 'Create Customer Group'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Organize customers into a segment for one-click lead distribution.
                </p>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => setIsGroupModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveGroup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Group Name */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 6, color: '#334155' }}>
                  Group Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IT Customers"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="desk-form-input"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 6, color: '#334155' }}>
                  Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  required
                  value={groupForm.category}
                  onChange={(e) => setGroupForm({ ...groupForm, category: e.target.value })}
                  className="desk-form-input"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                >
                  {PREDEFINED_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description (optional) */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 6, color: '#334155' }}>
                  Description <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief note about the customers or industry in this group..."
                  value={groupForm.description}
                  onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="desk-form-input"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', resize: 'vertical' }}
                />
              </div>

              {/* Assign Customers (Multi-select searchable list) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.84rem', color: '#334155' }}>
                    Assign Customers ({selectedCustIdsForGroup.size} Selected)
                  </label>
                  {allCustomers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCustIdsForGroup.size === allCustomers.length) {
                          setSelectedCustIdsForGroup(new Set());
                        } else {
                          setSelectedCustIdsForGroup(new Set(allCustomers.map((c) => c.id)));
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4f46e5',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {selectedCustIdsForGroup.size === allCustomers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {/* Search within customers list */}
                <input
                  type="text"
                  placeholder="Search existing customers by name, company, or phone..."
                  value={custModalSearch}
                  onChange={(e) => setCustModalSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.82rem',
                    marginBottom: 8,
                  }}
                />

                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#f8fafc',
                    padding: 6,
                  }}
                >
                  {allCustomers.length === 0 ? (
                    <div style={{ padding: 14, textAlign: 'center', fontSize: '0.82rem', color: '#94a3b8' }}>
                      No customers found in database.
                    </div>
                  ) : (
                    allCustomers
                      .filter((c) => {
                        if (!custModalSearch.trim()) return true;
                        const q = custModalSearch.toLowerCase();
                        return (
                          c.name.toLowerCase().includes(q) ||
                          c.company.toLowerCase().includes(q) ||
                          (c.phone || '').includes(q) ||
                          (c.email || '').toLowerCase().includes(q)
                        );
                      })
                      .map((c) => {
                        const isChecked = selectedCustIdsForGroup.has(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => handleToggleCustomerForGroup(c.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 10px',
                              borderRadius: 6,
                              marginBottom: 4,
                              background: isChecked ? '#eef2ff' : '#ffffff',
                              border: isChecked ? '1px solid #c7d2fe' : '1px solid #f1f5f9',
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // Handled by div onClick
                                style={{ cursor: 'pointer' }}
                              />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1e293b' }}>
                                  {c.company}
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                  {c.contact} • {c.phone || c.email}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#64748b',
                                background: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {c.category}
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  onClick={() => setIsGroupModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sales-btn-primary">
                  {editingGroup ? 'Save Changes' : 'Save Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 2: VIEW & MANAGE GROUP CUSTOMERS
         ========================================================================= */}
      {viewingGroup && (
        <div className="sales-modal-overlay" onClick={() => setViewingGroup(null)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 680, width: '100%', borderRadius: 12, padding: 24 }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    {viewingGroup.name}
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
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Manage customers assigned to this group.
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

            {/* Toolbar: Search & Add Customers toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search group customers..."
                  value={viewMemberSearch}
                  onChange={(e) => setViewMemberSearch(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: 32,
                    paddingRight: 10,
                    paddingTop: 8,
                    paddingBottom: 8,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              <button
                type="button"
                className={isAddingMembersOpen ? 'sales-btn-secondary' : 'sales-btn-primary'}
                onClick={() => setIsAddingMembersOpen(!isAddingMembersOpen)}
                style={{ padding: '8px 14px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
              >
                {isAddingMembersOpen ? (
                  <>
                    <X size={14} style={{ marginRight: 4 }} /> Close Add Panel
                  </>
                ) : (
                  <>
                    <UserPlus size={14} style={{ marginRight: 4 }} /> + Add Customers
                  </>
                )}
              </button>
            </div>

            {/* Add Customers Panel */}
            {isAddingMembersOpen && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#1e293b' }}>
                    Select Customers to Add ({addMembersSelectedIds.size} selected)
                  </div>
                  {addMembersSelectedIds.size > 0 && (
                    <button
                      type="button"
                      className="sales-btn-primary"
                      onClick={handleAddSelectedMembersToGroup}
                      style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                    >
                      Confirm Add ({addMembersSelectedIds.size})
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Search unassigned customers..."
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    marginBottom: 8,
                  }}
                />

                <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                  {(() => {
                    const assignedSet = new Set(
                      (membershipsMap[viewingGroup.id] || []).map((m) => m.id || m.customer_id)
                    );
                    const unassigned = allCustomers.filter((c) => !assignedSet.has(c.id));
                    const filteredUnassigned = unassigned.filter((c) => {
                      if (!addMemberSearch.trim()) return true;
                      const q = addMemberSearch.toLowerCase();
                      return (
                        c.name.toLowerCase().includes(q) ||
                        c.company.toLowerCase().includes(q) ||
                        (c.phone || '').includes(q)
                      );
                    });

                    if (filteredUnassigned.length === 0) {
                      return (
                        <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                          No unassigned customers available.
                        </div>
                      );
                    }

                    return filteredUnassigned.map((c) => {
                      const isChecked = addMembersSelectedIds.has(c.id);
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            setAddMembersSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            });
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: 6,
                            marginBottom: 4,
                            background: isChecked ? '#eef2ff' : '#ffffff',
                            border: isChecked ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={isChecked} onChange={() => {}} />
                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b' }}>
                              {c.company}
                            </span>
                            <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                              ({c.contact} • {c.phone})
                            </span>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{c.category}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Current Group Members Table */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                overflow: 'hidden',
                maxHeight: 340,
                overflowY: 'auto',
              }}
            >
              {(() => {
                const members = membershipsMap[viewingGroup.id] || [];
                const filteredMembers = members.filter((m) => {
                  if (!viewMemberSearch.trim()) return true;
                  const q = viewMemberSearch.toLowerCase();
                  const cName = (m.companyName || m.name || m.company_name || '').toLowerCase();
                  const cContact = (m.contactPerson || m.contact || m.contact_person || '').toLowerCase();
                  const cPhone = (m.phone || '').toLowerCase();
                  const cEmail = (m.email || '').toLowerCase();
                  return cName.includes(q) || cContact.includes(q) || cPhone.includes(q) || cEmail.includes(q);
                });

                if (members.length === 0) {
                  return (
                    <div style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                      <Users size={32} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b' }}>
                        No customers assigned yet
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 12px' }}>
                        Click "+ Add Customers" above to assign customers to this group.
                      </p>
                    </div>
                  );
                }

                if (filteredMembers.length === 0) {
                  return (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.84rem' }}>
                      No customers match "{viewMemberSearch}".
                    </div>
                  );
                }

                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                          Company & Contact
                        </th>
                        <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                          Details
                        </th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', fontSize: '0.78rem', color: '#475569' }}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => {
                        const mId = m.id || m.customer_id;
                        const mCompany = m.companyName || m.company_name || m.name || 'Company';
                        const mContact = m.contactPerson || m.contact_person || m.contact || 'Contact';
                        const mPhone = m.phone || '';
                        const mEmail = m.email || '';
                        return (
                          <tr key={mId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#1e293b' }}>
                                {mCompany}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                {mContact}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontSize: '0.76rem', color: '#334155' }}>{mPhone}</div>
                              {mEmail && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{mEmail}</div>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(viewingGroup.id, mId, mCompany)}
                                style={{
                                  background: 'none',
                                  border: '1px solid #fecdd3',
                                  color: '#e11d48',
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title="Remove customer from this group"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
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
         MODAL 3: COMPACT LEAD DISTRIBUTION (Single Screen, No Wizard)
         ========================================================================= */}
      {distributeGroup && (
        <div className="sales-modal-overlay" onClick={() => !isDistributing && setDistributeGroup(null)}>
          <div
            className="sales-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 580, width: '100%', borderRadius: 12, padding: 24 }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  Distribute Lead
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Target Group: <strong>{distributeGroup.name}</strong> ({distributeGroup.category})
                </p>
              </div>
              <button
                type="button"
                className="desk-close-btn"
                onClick={() => !isDistributing && setDistributeGroup(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Confirmation Banner */}
            {(() => {
              const count = getCustomerCount(distributeGroup);
              if (count === 0) {
                return (
                  <div
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      marginBottom: 16,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <AlertTriangle size={16} />
                    <span>This group has 0 customers. Assign customers first before distributing leads.</span>
                  </div>
                );
              }
              return (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#15803d',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>
                    Send this lead to {count} customer{count === 1 ? '' : 's'} in {distributeGroup.name}?
                  </span>
                </div>
              );
            })()}

            {/* Compact Form */}
            <form onSubmit={handleDistributeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Lead Title */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                  Lead Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inbound Enquiry for Enterprise Networking Setup"
                  value={distributeForm.title}
                  onChange={(e) => setDistributeForm({ ...distributeForm, title: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Lead Details / Requirement */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                  Lead Details / Requirement <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe buyer requirements, specifications, quantities, or scope..."
                  value={distributeForm.requirement}
                  onChange={(e) => setDistributeForm({ ...distributeForm, requirement: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', resize: 'vertical' }}
                />
              </div>

              {/* Buyer Name & Buyer Mobile */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                    Buyer Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Patel"
                    value={distributeForm.buyerName}
                    onChange={(e) => setDistributeForm({ ...distributeForm, buyerName: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                    Buyer Mobile <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit mobile (e.g. 9876543210)"
                    value={distributeForm.buyerPhone}
                    onChange={(e) => setDistributeForm({ ...distributeForm, buyerPhone: e.target.value.replace(/\D/g, '') })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              {/* Buyer Email & Budget */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                    Buyer Email <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="buyer@example.com"
                    value={distributeForm.buyerEmail}
                    onChange={(e) => setDistributeForm({ ...distributeForm, buyerEmail: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                    Budget <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ₹50,000"
                    value={distributeForm.budget}
                    onChange={(e) => setDistributeForm({ ...distributeForm, budget: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              {/* Location & Priority */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                    Location <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai, Maharashtra"
                    value={distributeForm.location}
                    onChange={(e) => setDistributeForm({ ...distributeForm, location: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.84rem', marginBottom: 5, color: '#334155' }}>
                    Priority
                  </label>
                  <select
                    value={distributeForm.priority}
                    onChange={(e) => setDistributeForm({ ...distributeForm, priority: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Normal">Normal</option>
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="sales-btn-secondary"
                  disabled={isDistributing}
                  onClick={() => setDistributeGroup(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sales-btn-primary"
                  disabled={isDistributing || getCustomerCount(distributeGroup) === 0}
                  style={{ minWidth: 160 }}
                >
                  {isDistributing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Distributing...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Distribute Lead
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
