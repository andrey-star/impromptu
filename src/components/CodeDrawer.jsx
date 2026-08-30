import React from 'react';
import { X, Code2, Save } from 'lucide-react';

export default function CodeDrawer({ isOpen, onClose, abcCode, setAbcCode, currentFile }) {
  if (!isOpen) return null;

  return (
    <aside className="code-drawer no-print">
      <div className="drawer-header">
        <div className="drawer-title">
          <Code2 size={15} />
          <span>{currentFile}</span>
        </div>
        <button className="btn-icon-close" onClick={onClose} title="Close ABC Code (Cmd+J)">
          <X size={15} />
        </button>
      </div>

      <div className="drawer-body">
        <textarea
          value={abcCode}
          onChange={(e) => setAbcCode(e.target.value)}
          className="drawer-textarea"
          spellCheck="false"
          placeholder="ABC 2.1 notation..."
        />
      </div>

      <div className="drawer-footer">
        <div className="drawer-helper">
          <code>[CEG]4</code> chord &bull; <code>|: ... :|</code> repeat &bull; <code>K:Cm</code> key
        </div>
      </div>
    </aside>
  );
}
