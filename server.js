import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';
const DIST_DIR = path.join(__dirname, 'dist');
const LIBRARY_DIR = path.join(__dirname, 'library');
const AGY_BIN = process.env.ANTIGRAVITY_AGENTAPI_EXE || '/root/.local/bin/agy';

// Map storing active conversation IDs per score file
// Key: filename (e.g. "skyfall.abc"), Value: engine-generated conversationId string
const scoreConversations = new Map();

// Ensure library directory exists
if (!fs.existsSync(LIBRARY_DIR)) {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
}

// Keep track of connected SSE clients for live hot-reloading
const clients = new Set();

function broadcastScoreUpdate(filename, content) {
  const message = `data: ${JSON.stringify({ type: 'score_updated', file: filename, code: content })}\n\n`;
  for (const client of clients) {
    try {
      client.write(message);
    } catch (e) {
      clients.delete(client);
    }
  }
  console.log(`[Hot-Reload] Broadcasted update for "${filename}" to ${clients.size} client(s)`);
}

// Watch library directory for changes on disk (triggered when AI or user edits any .abc file)
fs.watch(LIBRARY_DIR, (eventType, filename) => {
  if (filename && filename.endsWith('.abc')) {
    const filePath = path.join(LIBRARY_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        broadcastScoreUpdate(filename, content);
      }
    } catch (e) {}
  }
});

// Helper starter template for new files
function getStarterAbc(title = 'Untitled') {
  return `X: 1
T: ${title}
M: 4/4
L: 1/4
Q: 1/4=100
K: C
V: 1 clef=treble
V: 2 clef=bass
%%staves {(1) (2)}
[V: 1] z4 |
[V: 2] z4 |
`;
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. SSE Live Stream Endpoint
  if (req.url === '/api/live-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  // 2. GET /api/scores - List all .abc files in library
  if (req.url === '/api/scores' && req.method === 'GET') {
    try {
      const files = fs.readdirSync(LIBRARY_DIR)
        .filter(f => f.endsWith('.abc'))
        .map(f => ({
          filename: f,
          hasSession: scoreConversations.has(f)
        }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. POST /api/scores/new - Create a new .abc file
  if (req.url === '/api/scores/new' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        let { filename, title } = JSON.parse(body || '{}');
        if (!filename || !filename.trim()) {
          filename = `sketch_${Date.now()}`;
        }
        filename = filename.trim();
        if (!filename.endsWith('.abc')) {
          filename += '.abc';
        }
        // Sanitize filename
        filename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');

        const filePath = path.join(LIBRARY_DIR, filename);
        if (!fs.existsSync(filePath)) {
          const starterTitle = title || filename.replace('.abc', '').replace(/_/g, ' ');
          const starterCode = getStarterAbc(starterTitle);
          fs.writeFileSync(filePath, starterCode, 'utf8');
        }

        const code = fs.readFileSync(filePath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ filename, code }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. GET /api/score?file=... - Load a specific score
  if (req.url.startsWith('/api/score?') && req.method === 'GET') {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const file = urlParams.get('file');
    if (!file) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'file param required' }));
      return;
    }
    const safeFile = path.basename(file);
    const filePath = path.join(LIBRARY_DIR, safeFile);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Score not found' }));
      return;
    }
    const code = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ filename: safeFile, code }));
    return;
  }

  // 5. POST /api/save-score - Save edits to a specific score
  if (req.url === '/api/save-score' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { filename, code } = JSON.parse(body);
        if (!filename || code === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'filename and code required' }));
          return;
        }
        const safeFile = path.basename(filename);
        const filePath = path.join(LIBRARY_DIR, safeFile);
        fs.writeFileSync(filePath, code, 'utf8');
        broadcastScoreUpdate(safeFile, code);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. POST /api/ai-edit - Direct Agent In-Place Edit with Persistent Session per File
  if (req.url === '/api/ai-edit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { prompt: userPrompt, scoreFile = 'skyfall.abc' } = JSON.parse(body);
        if (!userPrompt || !userPrompt.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Prompt is required' }));
          return;
        }

        const safeFile = path.basename(scoreFile);
        const targetFilePath = path.join(LIBRARY_DIR, safeFile);

        // Ensure file exists
        if (!fs.existsSync(targetFilePath)) {
          fs.writeFileSync(targetFilePath, getStarterAbc(safeFile.replace('.abc', '')), 'utf8');
        }

        const existingConvId = scoreConversations.get(safeFile);

        const agentInstruction = `The composer is currently sitting at the piano editing sheet music in ABC notation.
Target file on disk: ${targetFilePath}

User's Musical Request:
"${userPrompt.trim()}"

Instructions:
1. Use your native file tools to inspect and directly modify ${targetFilePath} to apply the requested musical changes in ABC 2.1 notation.
2. Ensure measure lengths match the time signature (e.g. 4 beats in 4/4 time).
3. Preserve multi-voice structure and existing score headers unless requested to modify.
4. Reply with a concise, helpful natural language message explaining what musical changes you applied.`;

        const agyArgs = [
          '--output-format', 'json',
          '--dangerously-skip-permissions',
        ];

        if (existingConvId) {
          agyArgs.push('--conversation', existingConvId);
          console.log(`[AI-Edit] Continuing session [${existingConvId}] for "${safeFile}": "${userPrompt}"`);
        } else {
          console.log(`[AI-Edit] Starting new engine session for "${safeFile}": "${userPrompt}"`);
        }

        agyArgs.push('-p', agentInstruction);

        const agyProcess = spawn(AGY_BIN, agyArgs, {
          cwd: __dirname,
          env: process.env,
        });

        let stdoutData = '';
        let stderrData = '';

        agyProcess.stdout.on('data', data => {
          stdoutData += data.toString();
        });

        agyProcess.stderr.on('data', data => {
          stderrData += data.toString();
        });

        agyProcess.on('close', code => {
          if (code !== 0) {
            console.error(`[AI-Edit] agy exited with code ${code}:`, stderrData);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: stderrData || `AI agent exited with code ${code}` }));
            return;
          }

          let responseText = '';
          let convId = existingConvId;

          try {
            const parsedEnvelope = JSON.parse(stdoutData);
            if (parsedEnvelope.conversation_id) {
              convId = parsedEnvelope.conversation_id;
              scoreConversations.set(safeFile, convId);
              console.log(`[AI-Edit] Session active for "${safeFile}": ${convId} (Turn ${parsedEnvelope.num_turns || 1})`);
            }
            responseText = parsedEnvelope.response || 'Applied musical changes to the score.';
          } catch (jsonErr) {
            console.warn('[AI-Edit] Could not parse JSON envelope from agy, using raw output:', jsonErr);
            responseText = stdoutData.trim();
          }

          // Read the latest score directly from disk
          let updatedScore = '';
          try {
            if (fs.existsSync(targetFilePath)) {
              updatedScore = fs.readFileSync(targetFilePath, 'utf8');
              broadcastScoreUpdate(safeFile, updatedScore);
            }
          } catch (e) {}

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            filename: safeFile,
            code: updatedScore,
            message: responseText.trim(),
            conversationId: convId,
          }));
        });

        req.on('timeout', () => {
          agyProcess.kill();
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'AI request timed out' }));
        });

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 7. Static file serving from /dist
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(DIST_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, fallbackData) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fallbackData);
        }
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🎶 Impromptu Server running at http://localhost:${PORT}`);
  console.log(`📂 Library directory: ${LIBRARY_DIR}`);
  console.log(`🧠 AI Engine: ${AGY_BIN}`);
});
