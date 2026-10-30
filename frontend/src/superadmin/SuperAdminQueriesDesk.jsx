import React, { useState, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  Search,
  Filter,
  RefreshCw,
  Send,
  MessageSquare,
  Lock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  X,
  PlusCircle,
} from 'lucide-react';
import Swal from 'sweetalert2';
import superadminApi from '../services/superadminApi';

export default function SuperAdminQueriesDesk() {
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  // Selected Query Details Modal
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Create Query Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newQueryForm, setNewQueryForm] = useState({
    customerId: '',
    companyName: '',
    subject: '',
    category: 'Campaign Pacing',
    priority: 'normal',
    message: '',
  });
  const [submittingCreate, setSubmittingCreate] = useState(false);

  const fetchQueries = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await superadminApi.getQueries({
        search,
        status: statusFilter,
        priority: priorityFilter,
        page: pagination.page,
        limit: 20,
      });

      if (res && res.ok) {
        setQueries(res.queries || []);
        if (res.pagination) setPagination(res.pagination);
      }
    } catch (err) {
      console.error('[SuperAdminQueriesDesk] Load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter, priorityFilter, pagination.page]);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  // Open Conversation Thread
  const handleOpenQuery = async (queryItem) => {
    setSelectedQuery(queryItem);
    setLoadingThread(true);
    setReplyText('');
    setIsInternalNote(false);
    try {
      const res = await superadminApi.getQueryDetail(queryItem.id);
      if (res && res.ok) {
        setSelectedQuery(res.query || queryItem);
        setMessages(res.messages || []);
      }
    } catch (err) {
      console.error('Failed to load query messages:', err);
    } finally {
      setLoadingThread(false);
    }
  };

  // Send Reply or Internal Note
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedQuery) return;

    setSendingReply(true);
    try {
      const res = await superadminApi.replyQuery(selectedQuery.id, {
        message: replyText.trim(),
        isInternalNote,
        adminName: 'Super Admin',
      });

      if (res && res.ok) {
        setReplyText('');
        // Refresh thread messages
        const updatedDetail = await superadminApi.getQueryDetail(selectedQuery.id);
        if (updatedDetail && updatedDetail.ok) {
          setMessages(updatedDetail.messages || []);
          setSelectedQuery(updatedDetail.query);
        }
        fetchQueries();
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Reply Failed', text: err.message });
    } finally {
      setSendingReply(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedQuery) return;
    try {
      const res = await superadminApi.updateQueryStatus(selectedQuery.id, {
        status: newStatus,
        adminName: 'Super Admin',
      });
      if (res && res.ok) {
        setSelectedQuery((prev) => ({ ...prev, status: newStatus }));
        fetchQueries();
        Swal.fire({
          icon: 'success',
          title: `Status set to ${newStatus}`,
          timer: 1200,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Update Failed', text: err.message });
    }
  };

  // Create Ticket Submit
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newQueryForm.subject.trim()) {
      Swal.fire({ icon: 'warning', title: 'Subject is required.' });
      return;
    }

    setSubmittingCreate(true);
    try {
      const res = await superadminApi.createQuery(newQueryForm);
      if (res && res.ok) {
        setShowCreateModal(false);
        setNewQueryForm({
          customerId: '',
          companyName: '',
          subject: '',
          category: 'Campaign Pacing',
          priority: 'normal',
          message: '',
        });
        fetchQueries();
        Swal.fire({
          icon: 'success',
          title: 'Query Created',
          text: 'Ticket has been registered and assigned.',
        });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Creation Failed', text: err.message });
    } finally {
      setSubmittingCreate(false);
    }
  };

  return (
    <div className="sa-desk-content">
      {/* 1. Page Header */}
      <div className="sa-page-header">
        <div>
          <h1>Check Customer Queries</h1>
          <p>
            Track and resolve incoming support queries from registered businesses. Respond directly, attach internal notes for operations staff, and assign tickets.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="sa-btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <PlusCircle size={15} />
            <span>Create Query</span>
          </button>
          <button
            type="button"
            className="sa-btn-secondary"
            onClick={fetchQueries}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Live Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 2. Controls & Filters */}
      <div className="sa-controls-card">
        <div className="sa-search-box">
          <Search size={16} className="sa-search-icon" />
          <input
            type="text"
            className="sa-search-input"
            placeholder="Search by query ID, company name, subject, or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sa-filter-group">
          <select
            className="sa-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="open">Open (Unresolved)</option>
            <option value="pending">In Progress / Pending</option>
            <option value="resolved">Resolved</option>
          </select>

          <select
            className="sa-select"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
          </select>
        </div>
      </div>

      {/* 3. Queries Table */}
      <div className="sa-table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="sa-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Ticket ID</th>
                <th style={{ width: '22%' }}>Business / Account</th>
                <th style={{ width: '32%' }}>Subject &amp; Category</th>
                <th style={{ width: '12%' }}>Priority</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading queries...</div>
                  </td>
                </tr>
              ) : queries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                    <HelpCircle size={32} style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>No matching queries found</div>
                    <div style={{ fontSize: '0.80rem' }}>Try clearing filters or search criteria.</div>
                  </td>
                </tr>
              ) : (
                queries.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.80rem', fontWeight: 700, color: '#4f46e5' }}>
                        {q.id}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                        {new Date(q.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </div>
                    </td>

                    <td>
                      <strong style={{ color: '#0f172a' }}>{q.company_name}</strong>
                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                        {q.contact_name || q.customer_contact || 'Contact Unspecified'}
                      </div>
                      {(q.contact_phone || q.customer_phone) && (
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          📞 {q.contact_phone || q.customer_phone}
                        </div>
                      )}
                    </td>

                    <td>
                      <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>{q.subject}</strong>
                      <div style={{ marginTop: 4 }}>
                        <span className="sa-pill sa-pill-slate" style={{ fontSize: '0.66rem' }}>
                          {q.category}
                        </span>
                      </div>
                      {q.last_replied_by && (
                        <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 4 }}>
                          Last reply by <strong>{q.last_replied_by}</strong>
                        </div>
                      )}
                    </td>

                    <td>
                      <span
                        className={`sa-pill ${
                          q.priority === 'urgent'
                            ? 'sa-pill-rose'
                            : q.priority === 'high'
                            ? 'sa-pill-amber'
                            : 'sa-pill-slate'
                        }`}
                      >
                        {q.priority}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`sa-pill ${
                          q.status === 'resolved'
                            ? 'sa-pill-green'
                            : q.status === 'pending'
                            ? 'sa-pill-blue'
                            : 'sa-pill-rose'
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="sa-btn-primary"
                        style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        onClick={() => handleOpenQuery(q)}
                      >
                        <MessageSquare size={13} />
                        <span>Thread</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Query Conversation Drawer / Modal */}
      {selectedQuery && (
        <div className="sa-modal-backdrop" onClick={() => setSelectedQuery(null)}>
          <div
            className="sa-modal-card"
            style={{ maxWidth: 720 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sa-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="sa-pill sa-pill-indigo">{selectedQuery.category}</span>
                  <span
                    className={`sa-pill ${
                      selectedQuery.status === 'resolved'
                        ? 'sa-pill-green'
                        : selectedQuery.status === 'pending'
                        ? 'sa-pill-blue'
                        : 'sa-pill-rose'
                    }`}
                  >
                    {selectedQuery.status}
                  </span>
                </div>
                <h3 style={{ margin: '6px 0 2px 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  {selectedQuery.subject}
                </h3>
                <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                  {selectedQuery.company_name} • ID: {selectedQuery.id}
                </div>
              </div>

              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setSelectedQuery(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="sa-modal-body" style={{ background: '#f8fafc' }}>
              {/* Status Controls */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: '0.80rem', color: '#64748b' }}>
                  Quick Action: Mark as
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedQuery.status !== 'open' && (
                    <button
                      type="button"
                      className="sa-btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                      onClick={() => handleUpdateStatus('open')}
                    >
                      Reopen
                    </button>
                  )}
                  {selectedQuery.status !== 'pending' && (
                    <button
                      type="button"
                      className="sa-btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                      onClick={() => handleUpdateStatus('pending')}
                    >
                      In Progress
                    </button>
                  )}
                  {selectedQuery.status !== 'resolved' && (
                    <button
                      type="button"
                      className="sa-btn-success"
                      style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                      onClick={() => handleUpdateStatus('resolved')}
                    >
                      <CheckCircle2 size={13} />
                      <span>Resolve</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Thread */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {loadingThread ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                    <RefreshCw size={18} className="spin" style={{ margin: '0 auto 6px' }} />
                    <div>Loading thread messages...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', background: '#ffffff', borderRadius: 8 }}>
                    No messages recorded yet in this conversation thread.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: m.is_internal_note ? '1px dashed #f59e0b' : '1px solid #e2e8f0',
                        background: m.is_internal_note
                          ? '#fffbeb'
                          : m.sender_type === 'admin'
                          ? '#eef2ff'
                          : '#ffffff',
                        alignSelf: m.sender_type === 'admin' && !m.is_internal_note ? 'flex-end' : 'flex-start',
                        maxWidth: '90%',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 4,
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: m.is_internal_note
                            ? '#b45309'
                            : m.sender_type === 'admin'
                            ? '#4338ca'
                            : '#0f172a',
                        }}
                      >
                        {m.is_internal_note && <Lock size={12} />}
                        <span>{m.sender_name}</span>
                        {m.is_internal_note && <span>(Internal Note)</span>}
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: 'auto' }}>
                          {new Date(m.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                        {m.message}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply}>
                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 10, padding: 12 }}>
                  <textarea
                    rows={3}
                    className="sa-form-textarea"
                    style={{ border: 'none', padding: 0, resize: 'none' }}
                    placeholder={
                      isInternalNote
                        ? 'Write internal note (hidden from customer)...'
                        : 'Type administrative reply to customer...'
                    }
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />

                  <div
                    style={{
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: 10,
                      marginTop: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#64748b', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                      />
                      <span>Internal staff note</span>
                    </label>

                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className={isInternalNote ? 'sa-btn-secondary' : 'sa-btn-primary'}
                      style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                    >
                      <Send size={13} />
                      <span>{sendingReply ? 'Posting...' : isInternalNote ? 'Save Note' : 'Send Reply'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create Ticket Modal */}
      {showCreateModal && (
        <div className="sa-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sa-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Create New Support Ticket</h3>
              <button
                type="button"
                className="sa-footer-btn"
                style={{ width: 'auto', padding: 6, borderRadius: '50%' }}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket}>
              <div className="sa-modal-body">
                <div className="sa-form-group">
                  <label className="sa-form-label">Business / Company Name</label>
                  <input
                    type="text"
                    className="sa-form-input"
                    placeholder="e.g. Acme Tech Solutions"
                    value={newQueryForm.companyName}
                    onChange={(e) => setNewQueryForm({ ...newQueryForm, companyName: e.target.value })}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Subject *</label>
                  <input
                    type="text"
                    required
                    className="sa-form-input"
                    placeholder="Brief description of the issue or enquiry"
                    value={newQueryForm.subject}
                    onChange={(e) => setNewQueryForm({ ...newQueryForm, subject: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="sa-form-group">
                    <label className="sa-form-label">Category</label>
                    <select
                      className="sa-select"
                      style={{ width: '100%' }}
                      value={newQueryForm.category}
                      onChange={(e) => setNewQueryForm({ ...newQueryForm, category: e.target.value })}
                    >
                      <option value="Campaign Pacing">Campaign Pacing</option>
                      <option value="Billing &amp; Top-Up">Billing &amp; Top-Up</option>
                      <option value="Creative Production">Creative Production</option>
                      <option value="Lead Quality">Lead Quality</option>
                      <option value="Account Access">Account Access</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="sa-form-group">
                    <label className="sa-form-label">Priority</label>
                    <select
                      className="sa-select"
                      style={{ width: '100%' }}
                      value={newQueryForm.priority}
                      onChange={(e) => setNewQueryForm({ ...newQueryForm, priority: e.target.value })}
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-form-label">Initial Message / Context</label>
                  <textarea
                    rows={4}
                    className="sa-form-textarea"
                    placeholder="Enter customer message or background context..."
                    value={newQueryForm.message}
                    onChange={(e) => setNewQueryForm({ ...newQueryForm, message: e.target.value })}
                  />
                </div>
              </div>

              <div className="sa-modal-footer">
                <button
                  type="button"
                  className="sa-btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="sa-btn-primary"
                >
                  {submittingCreate ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

