import React, { useState, useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import ScoreViewer from './components/ScoreViewer';
import ScoreSelector from './components/ScoreSelector';
import CommandBar from './components/CommandBar';
import CodeDrawer from './components/CodeDrawer';
import { Play, Square, Download, Code2, Music, Sparkles } from 'lucide-react';

export default function App() {
  // Read initial file from URL query param (?file=...) or default to skyfall.abc
  const getInitialFileFromUrl = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const fileParam = params.get('file') || params.get('score');
      if (fileParam) return fileParam;
      if (window.location.hash) {
        const hashFile = window.location.hash.replace(/^#\/?/, '');
        if (hashFile.endsWith('.abc')) return hashFile;
      }
    }
    return 'skyfall.abc';
  };

  const [currentFile, setCurrentFile] = useState(getInitialFileFromUrl);
  const [abcCode, setAbcCode] = useState('');
  const [isCodeDrawerOpen, setIsCodeDrawerOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthReady, setIsSynthReady] = useState(false);

  const visualObjRef = useRef(null);
  const synthRef = useRef(null);
  const activeFileRef = useRef(currentFile);

  useEffect(() => {
    activeFileRef.current = currentFile;
  }, [currentFile]);

  // Update browser URL route without reloading
  const updateUrlRoute = (filename) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('file') !== filename) {
        url.searchParams.set('file', filename);
        window.history.pushState({ file: filename }, '', url.toString());
      }
    }
  };

  // Load score file from backend
  const loadScoreFile = async (filename, shouldUpdateUrl = true) => {
    try {
      if (isPlaying && synthRef.current) {
        synthRef.current.stop();
        setIsPlaying(false);
      }
      const res = await fetch(`/api/score?file=${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.code !== undefined) {
        setAbcCode(data.code);
        setCurrentFile(filename);
        if (shouldUpdateUrl) {
          updateUrlRoute(filename);
        }
      }
    } catch (e) {
      console.warn(`Error loading score ${filename}:`, e);
    }
  };

  // Load initial score on mount & listen for browser back/forward (popstate)
  useEffect(() => {
    const initial = getInitialFileFromUrl();
    loadScoreFile(initial, false);

    const handlePopState = (e) => {
      const fileFromUrl = getInitialFileFromUrl();
      loadScoreFile(fileFromUrl, false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Connect to SSE Live Stream
  useEffect(() => {
    let eventSource = null;
    try {
      eventSource = new EventSource('/api/live-stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'score_updated' && data.file === activeFileRef.current && data.code) {
            setAbcCode(data.code);
          }
        } catch (err) {
          console.warn('Error parsing SSE event:', err);
        }
      };
    } catch (e) {
      console.warn('SSE unavailable:', e);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  // Sync manual code edits to server
  const handleCodeChange = (newCode) => {
    setAbcCode(newCode);
    try {
      fetch('/api/save-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: currentFile, code: newCode }),
      }).catch(() => {});
    } catch (e) {}
  };

  // Web Audio Synth Playback
  const handlePlayToggle = async () => {
    if (!visualObjRef.current) return;

    if (isPlaying) {
      if (synthRef.current) synthRef.current.stop();
      setIsPlaying(false);
      return;
    }

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const synth = new abcjs.synth.CreateSynth();

      await synth.init({
        audioContext,
        visualObj: visualObjRef.current,
        millisecondsPerMeasure: visualObjRef.current.millisecondsPerMeasure() || 2000,
        options: {
          soundFontUrl: 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/',
        },
      });

      await synth.prime();
      synthRef.current = synth;
      await synth.start();
      setIsPlaying(true);
    } catch (e) {
      console.warn('Audio playback not ready:', e);
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  // Keyboard shortcut: Cmd/Ctrl + J to toggle raw ABC code
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsCodeDrawerOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`impromptu-app ${isCodeDrawerOpen ? 'drawer-open' : ''}`}>
      {/* Sleek Minimalist Classical Header */}
      <header className="site-header no-print">
        <div className="header-left">
          <div className="brand-mark">
            <span className="brand-name">Impromptu</span>
          </div>
          <span className="header-slash">/</span>
          <ScoreSelector
            currentFile={currentFile}
            onSelectScore={(file) => loadScoreFile(file)}
            onScoreCreated={(file, code) => {
              setCurrentFile(file);
              setAbcCode(code);
              updateUrlRoute(file);
            }}
          />
        </div>

        <div className="header-right">
          {/* Audio Playback Button */}
          <button
            type="button"
            onClick={handlePlayToggle}
            className={`btn-nav ${isPlaying ? 'btn-nav-playing' : ''}`}
            title={isPlaying ? "Stop (Space)" : "Play Audio"}
          >
            {isPlaying ? <Square size={13} className="fill-current" /> : <Play size={13} className="fill-current" />}
            <span>{isPlaying ? 'Stop' : 'Play'}</span>
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={handleExportPDF}
            className="btn-nav"
            title="Export to PDF (window.print)"
          >
            <Download size={13} />
            <span>PDF</span>
          </button>

          {/* On-Demand ABC Code Toggle */}
          <button
            type="button"
            onClick={() => setIsCodeDrawerOpen(prev => !prev)}
            className={`btn-nav ${isCodeDrawerOpen ? 'btn-nav-active' : ''}`}
            title="Toggle Raw ABC Source (Cmd+J)"
          >
            <Code2 size={13} />
            <span>ABC</span>
          </button>
        </div>
      </header>

      {/* Main Classical Workspace */}
      <main className="workspace-main">
        <ScoreViewer
          abcCode={abcCode}
          visualObjRef={visualObjRef}
          setIsSynthReady={setIsSynthReady}
        />

        {/* Floating AI Command Bar */}
        <CommandBar
          abcCode={abcCode}
          setAbcCode={setAbcCode}
          currentFile={currentFile}
        />
      </main>

      {/* On-Demand Code Drawer */}
      <CodeDrawer
        isOpen={isCodeDrawerOpen}
        onClose={() => setIsCodeDrawerOpen(false)}
        abcCode={abcCode}
        setAbcCode={handleCodeChange}
        currentFile={currentFile}
      />
    </div>
  );
}
