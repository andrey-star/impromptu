import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, FileText, Check, X } from 'lucide-react';

export default function ScoreSelector({ currentFile, onSelectScore, onScoreCreated }) {
  const [scores, setScores] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchScoreList = async () => {
    try {
      const res = await fetch('/api/scores');
      const data = await res.json();
      if (data.files) {
        setScores(data.files);
      }
    } catch (e) {
      console.warn('Error fetching score list:', e);
    }
  };

  useEffect(() => {
    fetchScoreList();
  }, [currentFile]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateNew = async (e) => {
    e.preventDefault();
    if (!newFilename.trim()) return;

    setLoading(true);
    try {
      let fname = newFilename.trim();
      if (!fname.endsWith('.abc')) fname += '.abc';

      const res = await fetch('/api/scores/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fname }),
      });
      const data = await res.json();

      if (data.filename) {
        setNewFilename('');
        setIsCreating(false);
        setIsOpen(false);
        await fetchScoreList();
        onScoreCreated(data.filename, data.code);
      }
    } catch (err) {
      console.error('Error creating score:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="score-selector-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className="btn-score-select"
        onClick={() => setIsOpen(prev => !prev)}
      >
        <span className="current-score-name">{currentFile}</span>
        <ChevronDown size={14} className={`chevron-icon ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="score-dropdown-menu">
          <div className="dropdown-section-title">Scores in Library</div>
          <div className="dropdown-items-list">
            {scores.map((s) => (
              <button
                key={s.filename}
                type="button"
                className={`dropdown-item ${s.filename === currentFile ? 'active' : ''}`}
                onClick={() => {
                  onSelectScore(s.filename);
                  setIsOpen(false);
                }}
              >
                <FileText size={13} className="item-icon" />
                <span className="item-name">{s.filename}</span>
                {s.filename === currentFile && <Check size={13} className="item-check" />}
              </button>
            ))}
          </div>

          <div className="dropdown-divider" />

          {isCreating ? (
            <form onSubmit={handleCreateNew} className="dropdown-new-form">
              <input
                type="text"
                value={newFilename}
                onChange={(e) => setNewFilename(e.target.value)}
                placeholder="filename.abc"
                className="dropdown-input-new"
                autoFocus
                disabled={loading}
              />
              <button type="submit" className="btn-confirm-mini" disabled={!newFilename.trim() || loading}>
                <Check size={13} />
              </button>
              <button
                type="button"
                className="btn-cancel-mini"
                onClick={() => { setIsCreating(false); setNewFilename(''); }}
                disabled={loading}
              >
                <X size={13} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="btn-add-score"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={13} />
              <span>New Score...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
