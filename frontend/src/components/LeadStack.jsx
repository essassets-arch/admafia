import React, { useState } from 'react';

export default function LeadStack() {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const leads = [
    {
      id: 1,
      initial: 'R',
      name: 'Rohit Sharma',
      phone: '+91 98•••• 4521',
      badge: 'New lead',
    },
    {
      id: 2,
      initial: 'P',
      name: 'Priya Patel',
      phone: '+91 99•••• 8830',
      badge: 'New lead',
    },
    {
      id: 3,
      initial: 'A',
      name: 'Amit Verma',
      phone: '+91 97•••• 1207',
      badge: 'New lead',
    },
  ];

  return (
    <div className="lead-stack-container" aria-hidden="true">
      {/* Lead Cards 1, 2, 3 */}
      {leads.map((lead, idx) => (
        <div
          key={lead.id}
          className={`lead-card card-item-${idx + 1} ${hoveredIdx === idx ? 'is-hovered' : ''}`}
          onMouseEnter={() => setHoveredIdx(idx)}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <i className="lead-avatar">{lead.initial}</i>
          <div className="lead-details">
            <strong>{lead.name}</strong>
            <span>{lead.phone}</span>
          </div>
          <em className="lead-badge">{lead.badge}</em>
        </div>
      ))}

      {/* Final Card: You follow up */}
      <div
        className={`lead-card card-final ${hoveredIdx === 3 ? 'is-hovered' : ''}`}
        onMouseEnter={() => setHoveredIdx(3)}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <i className="lead-avatar final-avatar">₹</i>
        <div className="lead-details">
          <strong>You follow up</strong>
          <span>Call. Explain. Convert.</span>
        </div>
      </div>

      <style>{`
        .lead-stack-container {
          position: relative;
          height: 380px;
          max-width: 440px;
          width: 100%;
          margin: 0 auto;
          font-family: 'Figtree', system-ui, -apple-system, sans-serif;
        }

        .lead-card {
          position: absolute;
          left: 0;
          right: 0;
          background: #ffffff;
          color: #232043;
          border-radius: 18px;
          padding: 16px 20px;
          display: flex;
          gap: 16px;
          align-items: center;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, z-index 0.25s ease;
          cursor: pointer;
          user-select: none;
        }

        .lead-avatar {
          flex: none;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: #eef0ff;
          display: grid;
          place-items: center;
          font-family: 'Bricolage Grotesque', system-ui, sans-serif;
          font-weight: 800;
          font-size: 1.1rem;
          font-style: normal;
          color: #2a2380;
        }

        .lead-details strong {
          display: block;
          font-size: 1.05rem;
          font-weight: 700;
          line-height: 1.25;
          color: #1a1550;
        }

        .lead-details span {
          display: block;
          color: #5d5a85;
          font-size: 0.94rem;
          margin-top: 2px;
          letter-spacing: 0.02em;
        }

        .lead-badge {
          margin-left: auto;
          font-family: 'Figtree', system-ui, sans-serif;
          font-weight: 700;
          font-size: 0.8rem;
          font-style: normal;
          background: #ffb800;
          color: #1a1550;
          padding: 5px 12px;
          border-radius: 99px;
          white-space: nowrap;
        }

        /* Initial positioning & tilt matching screenshot */
        .card-item-1 {
          top: 0;
          transform: rotate(-2deg);
          animation: dropIn 0.7s 0.1s both;
          z-index: 1;
        }

        .card-item-2 {
          top: 96px;
          transform: translateX(18px) rotate(1.5deg);
          animation: dropIn 0.7s 0.3s both;
          z-index: 2;
        }

        .card-item-3 {
          top: 192px;
          transform: translateX(-8px) rotate(-1deg);
          animation: dropIn 0.7s 0.5s both;
          z-index: 3;
        }

        /* Final Coral Card */
        .card-final {
          top: 288px;
          background: #ff5a4f;
          color: #ffffff;
          animation: dropIn 0.7s 0.7s both;
          z-index: 4;
        }

        .card-final .final-avatar {
          background: #ffffff;
          color: #ff5a4f;
          font-weight: 800;
          font-size: 1.15rem;
        }

        .card-final .lead-details strong {
          color: #ffffff;
        }

        .card-final .lead-details span {
          color: #ffe3e0;
        }

        /* Hover Elevation */
        .lead-card.is-hovered {
          transform: translateY(-6px) scale(1.03) !important;
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.38) !important;
          z-index: 10 !important;
        }

        @keyframes dropIn {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
          }
        }

        @media (max-width: 600px) {
          .lead-stack-container {
            height: 360px;
          }

          .lead-card {
            padding: 14px 16px;
          }

          .card-item-2 {
            transform: translateX(8px) rotate(1.5deg);
          }

          .card-item-3 {
            transform: translateX(-4px) rotate(-1deg);
          }
        }
      `}</style>
    </div>
  );
}
