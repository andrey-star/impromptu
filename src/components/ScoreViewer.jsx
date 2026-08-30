import React, { useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { AlertCircle } from 'lucide-react';

export default function ScoreViewer({ abcCode, visualObjRef, setIsSynthReady }) {
  const scoreRef = useRef(null);
  const [error, setError] = useState(null);

  // Render ABC to SVG whenever abcCode changes
  useEffect(() => {
    if (!scoreRef.current) return;

    try {
      setError(null);

      // Render SVG
      const visualObjs = abcjs.renderAbc(scoreRef.current, abcCode || 'X:1\nK:C\nz4 |', {
        responsive: 'resize',
        add_classes: true,
        staffwidth: 820,
        scale: 1.1,
        paddingtop: 20,
        paddingbottom: 30,
        paddingleft: 20,
        paddingright: 20,
      });

      if (visualObjs && visualObjs.length > 0) {
        if (visualObjRef) {
          visualObjRef.current = visualObjs[0];
        }
        if (setIsSynthReady && abcjs.synth && abcjs.synth.supportsAudio()) {
          setIsSynthReady(true);
        }
      }
    } catch (err) {
      console.error('ABC Render error:', err);
      setError(err.message || 'Syntax error in ABC notation');
    }
  }, [abcCode]);

  return (
    <div className="score-stage">
      {/* Error Alert */}
      {error && (
        <div className="score-error-banner no-print">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Pure Sheet Music Paper Canvas */}
      <div className="sheet-paper">
        <div ref={scoreRef} id="sheet-music-target" className="abcjs-container" />
      </div>
    </div>
  );
}
