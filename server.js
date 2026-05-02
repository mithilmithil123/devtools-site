const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('devtools.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('✓ Connected to SQLite');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, fname TEXT, lname TEXT, email TEXT UNIQUE, username TEXT UNIQUE, password TEXT, tool TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, fname TEXT, lname TEXT, email TEXT, topic TEXT, message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS documate_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, code_input TEXT, documentation TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id))`);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'DevTools backend is running ✓' });
});

app.post('/api/signup', (req, res) => {
  const { fname, lname, email, username, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  db.run('INSERT INTO users (fname, lname, email, username, password, tool) VALUES (?, ?, ?, ?, ?, ?)', [fname, lname, email, username, password, 'unknown'], function(err) {
    if (err) {
      console.error('Signup error:', err);
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    res.json({ success: true, message: 'Account created!', user_id: this.lastID });
  });
});

app.post('/api/contact', (req, res) => {
  const { fname, lname, email, topic, message } = req.body;
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message required' });
  }
  db.run('INSERT INTO contacts (fname, lname, email, topic, message) VALUES (?, ?, ?, ?, ?)', [fname, lname, email, topic, message], function(err) {
    if (err) {
      console.error('Contact error:', err);
      return res.status(500).json({ error: 'Failed to send message' });
    }
    res.json({ success: true, message: 'Your message has been sent! We\'ll respond within 24 hours.' });
  });
});

app.post('/api/documate', async (req, res) => {
  const { code, user_id } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }
  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'mistral',
      prompt: `Generate comprehensive documentation for this code:\n\n${code}\n\nProvide clear, concise documentation in markdown format.`,
      stream: false,
      temperature: 0.7
    });
    const documentation = response.data.response;
    if (user_id) {
      db.run('INSERT INTO documate_history (user_id, code_input, documentation) VALUES (?, ?, ?)', [user_id, code, documentation], (err) => {
        if (err) console.error('History save error:', err);
      });
    }
    res.json({ success: true, documentation: documentation, model: 'mistral' });
  } catch (error) {
    console.error('Ollama error:', error.message);
    res.status(500).json({ error: 'Documentation generation failed. Make sure Ollama is running locally.' });
  }
});

app.post('/api/flashforge', (req, res) => {
  const { iso_file, usb_device } = req.body;
  if (!iso_file || !usb_device) {
    return res.status(400).json({ error: 'ISO file and USB device required' });
  }
  res.json({
    success: true,
    message: `FlashForge would flash ${iso_file} to ${usb_device}`,
    status: 'This is a web preview. Download the FlashForge CLI tool for actual flashing.',
    progress: 100
  });
});

app.get('/api/user/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT id, fname, lname, email, username, tool, created_at FROM users WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(row);
  });
});

app.get('/api/documate-history/:user_id', (req, res) => {
  const { user_id } = req.params;
  db.all('SELECT * FROM documate_history WHERE user_id = ? ORDER BY created_at DESC', [user_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   DevTools Backend Server Running      ║
╠════════════════════════════════════════╣
║  Port:     ${PORT}                     ║
║  URL:      http://localhost:${PORT}    ║
║  Database: SQLite (devtools.db)        ║
║  AI:       Ollama (port 11434)         ║
╚════════════════════════════════════════╝

IMPORTANT: Start Ollama before testing DocuMate!
$ ollama serve
  `);
});

module.exports = app;
