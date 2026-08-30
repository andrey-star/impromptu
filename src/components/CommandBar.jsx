import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Sparkles, Mic, MicOff, ArrowUp, Loader2, History, X, AlertCircle } from 'lucide-react';

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
});

export default function CommandBar({ abcCode, setAbcCode, currentFile }) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const autoDismissTimerRef = useRef(null);

  // Initialize Web Speech API for voice dictation
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setPrompt(transcript);
      };

      recognition.onerror = (err) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or type your prompt.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setError(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Error starting speech recognition:', err);
      }
    }
  };

  const handleSendPrompt = async () => {
    if (!prompt.trim() || isLoading) return;

    const userText = prompt.trim();
    setPrompt('');
    setIsLoading(true);
    setError(null);
    setLastResponse(null);

    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
    }

    setHistory(prev => [...prev, { sender: 'user', text: userText, time: new Date().toLocaleTimeString() }]);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 90000); // 90-second safety timeout

    try {
      const response = await fetch('/api/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: userText,
          scoreFile: currentFile || 'skyfall.abc'
        }),
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to apply musical change');
      }

      const responseText = data.message || 'Score updated.';
      setLastResponse(responseText);
      setHistory(prev => [...prev, { sender: 'ai', text: responseText, time: new Date().toLocaleTimeString() }]);

      if (data.code) {
        setAbcCode(data.code);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('AI Edit Error:', err);
      const errorMessage = err.name === 'AbortError'
        ? 'Request timed out after 90s. The AI engine took too long to respond.'
        : (err.message || 'Error communicating with AI engine');
      setError(errorMessage);
      setHistory(prev => [...prev, { sender: 'ai', text: `Error: ${errorMessage}`, time: new Date().toLocaleTimeString(), isError: true }]);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
    if (e.key === 'Escape') {
      setLastResponse(null);
      setError(null);
      setShowHistory(false);
    }
  };

  // Helper to safely render markdown
  const renderMarkdown = (content) => {
    if (!content) return { __html: '' };
    return { __html: marked.parse(content) };
  };

  return (
    <div className="command-bar-wrapper no-print">
      {/* 1. History Popover */}
      {showHistory && (
        <div className="history-popover">
          <div className="history-popover-header">
            <span>Session History ({currentFile})</span>
            <button className="btn-icon-subtle" onClick={() => setShowHistory(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="history-popover-body">
            {history.length === 0 ? (
              <div className="history-empty">No edits or questions in this session yet.</div>
            ) : (
              history.map((h, i) => (
                <div key={i} className={`history-item ${h.sender === 'user' ? 'item-user' : 'item-ai'} ${h.isError ? 'item-error' : ''}`}>
                  <div className="history-meta">
                    <span className="history-author">{h.sender === 'user' ? 'You' : 'AI'}</span>
                    <span className="history-time">{h.time}</span>
                  </div>
                  {h.sender === 'ai' ? (
                    <div className="markdown-content" dangerouslySetInnerHTML={renderMarkdown(h.text)} />
                  ) : (
                    <p className="history-text">{h.text}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. Floating Markdown Response Card */}
      {lastResponse && !isLoading && (
        <div className="floating-response-card">
          <div className="response-card-header">
            <div className="response-card-title">
              <Sparkles size={13} className="text-zinc-400" />
              <span>Response</span>
            </div>
            <button
              className="btn-response-dismiss"
              onClick={() => setLastResponse(null)}
              title="Dismiss (Esc)"
            >
              <X size={14} />
            </button>
          </div>
          <div
            className="response-card-body markdown-content"
            dangerouslySetInnerHTML={renderMarkdown(lastResponse)}
          />
        </div>
      )}

      {/* 3. Floating Error Card */}
      {error && !isLoading && (
        <div className="floating-response-card error-card">
          <div className="response-card-header">
            <div className="response-card-title error-title">
              <AlertCircle size={14} />
              <span>Error</span>
            </div>
            <button
              className="btn-response-dismiss"
              onClick={() => setError(null)}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <div className="response-card-body error-text">{error}</div>
        </div>
      )}

      {/* 4. Loading Status Pill */}
      {isLoading && (
        <div className="floating-loading-pill">
          <Loader2 size={13} className="animate-spin" />
          <span>Arranging musical edits...</span>
        </div>
      )}

      {/* 5. Main Floating Command Bar */}
      <div className={`command-bar ${isListening ? 'listening' : ''} ${isLoading ? 'loading' : ''}`}>
        <button
          type="button"
          onClick={toggleListening}
          className={`btn-cmd-mic ${isListening ? 'active' : ''}`}
          title={isListening ? "Stop listening" : "Dictate with voice"}
          disabled={isLoading}
        >
          {isListening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening... speak notes, chords, or timing" : `Dictate notes, chords, or edits (e.g. 'In bar 2 melody goes C then G then Eb')...`}
          className="command-input"
          disabled={isLoading}
        />

        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory(prev => !prev)}
            className={`btn-cmd-action ${showHistory ? 'active' : ''}`}
            title="Toggle Dialogue History"
          >
            <History size={15} />
          </button>
        )}

        <button
          type="button"
          onClick={handleSendPrompt}
          className="btn-cmd-submit"
          disabled={!prompt.trim() || isLoading}
          title="Send (Enter)"
        >
          {isLoading ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
        </button>
      </div>
    </div>
  );
}
