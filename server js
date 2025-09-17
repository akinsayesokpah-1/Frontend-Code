// server.js - minimal social backend with SQLite, JWT auth, posts, likes, comments, follow, messages, notifications
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const path = require('path');

const DB_FILE = path.join(__dirname, 'social.db');
const db = new Database(DB_FILE);
const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- simple migrations ---
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, display TEXT, avatarColor TEXT
);
CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, follower_id INTEGER, followee_id INTEGER);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_id INTEGER, text TEXT, image TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, user_id INTEGER, text TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER, to_id INTEGER, text TEXT, createdAt TEXT);
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT, at TEXT, seen INTEGER DEFAULT 0);
`);

// --- helpers ---
function tokenForUser(user){
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '30d' });
}
function authMiddleware(req, res, next){
  const h = req.headers.authorization;
  if(!h) return res.status(401).json({ error:'missing token' });
  const parts = h.split(' ');
  if(parts.length !== 2) return res.status(401).json({ error:'bad token' });
  try{
    const payload = jwt.verify(parts[1], SECRET);
    const row = db.prepare('SELECT id,username,display,avatarColor FROM users WHERE id = ?').get(payload.id);
    if(!row) return res.status(401).json({ error:'user not found' });
    req.user = row;
    next();
  }catch(e){ return res.status(401).json({ error:'invalid token' }); }
}

// --- auth routes ---
app.post('/api/register', async (req,res) => {
  const { username, password, display } = req.body;
  if(!username || !password) return res.status(400).json({ error:'username+password required' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if(exists) return res.status(400).json({ error:'username taken' });
  const hash = await bcrypt.hash(password, 10);
  const avatarColor = ['#fda4af','#a78bfa','#60a5fa','#fde68a','#bbf7d0'][Math.floor(Math.random()*5)];
  const info = db.prepare('INSERT INTO users(username,password,display,avatarColor) VALUES(?,?,?,?)').run(username, hash, display || username, avatarColor);
  const user = db.prepare('SELECT id,username,display,avatarColor FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: tokenForUser(user), user });
});

app.post('/api/login', async (req,res) => {
  const { username, password } = req.body;
  if(!username || !password) return res.status(400).json({ error:'username+password required' });
  const user = db.prepare('SELECT id,username,password,display,avatarColor FROM users WHERE username = ?').get(username);
  if(!user) return res.status(400).json({ error:'user not found' });
  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).json({ error:'invalid credentials' });
  delete user.password;
  res.json({ token: tokenForUser(user), user });
});

app.get('/api/me', authMiddleware, (req,res) => {
  const u = req.user;
  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM follows WHERE follower_id=?) as following, (SELECT COUNT(*) FROM follows WHERE followee_id=?) as followers').get(u.id, u.id);
  res.json({ username: u.username, display: u.display, avatarColor: u.avatarColor, following_count: counts.following, followers_count: counts.followers });
});

// --- users list & follow ---
app.get('/api/users', (req,res) => {
  const rows = db.prepare('SELECT username,display,avatarColor FROM users ORDER BY username LIMIT 100').all();
  res.json({ users: rows });
});

app.post('/api/users/:username/follow', authMiddleware, (req,res) => {
  const target = db.prepare('SELECT id,username FROM users WHERE username = ?').get(req.params.username);
  if(!target) return res.status(404).json({ error:'user not found' });
  if(target.id === req.user.id) return res.status(400).json({ error:'cannot follow yourself' });
  const exists = db.prepare('SELECT id FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, target.id);
  if(exists){
    db.prepare('DELETE FROM follows WHERE id = ?').run(exists.id);
    return res.json({ ok:true, following:false });
  } else {
    db.prepare('INSERT INTO follows(follower_id, followee_id) VALUES(?,?)').run(req.user.id, target.id);
    db.prepare('INSERT INTO notifications(user_id, text, at) VALUES(?,?,?)').run(target.id, `${req.user.username} followed you`, new Date().toISOString());
    return res.json({ ok:true, following:true });
  }
});

// --- posts ---
app.post('/api/posts', authMiddleware, (req,res) => {
  const { text, image } = req.body;
  if(!text && !image) return res.status(400).json({ error:'need text or image' });
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO posts(author_id,text,image,createdAt) VALUES(?,?,?,?)').run(req.user.id, text || '', image || '', now);
  res.json({ ok:true, id: info.lastInsertRowid });
});

app.get('/api/posts', (req,res) => {
  const q = req.query.q;
  let rows;
  if(q){
    rows = db.prepare(`
      SELECT p.id,p.text,p.image,p.createdAt,u.username as author,u.display,u.avatarColor,
        (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
      FROM posts p JOIN users u ON p.author_id = u.id
      WHERE p.text LIKE ?
      ORDER BY p.createdAt DESC
      LIMIT 200
    `).all(`%${q}%`);
  } else if(req.query.trending){
    rows = db.prepare(`
      SELECT p.id,p.text,p.image,p.createdAt,u.username as author,u.display,u.avatarColor,
        (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
      FROM posts p JOIN users u ON p.author_id = u.id
      ORDER BY likes_count DESC LIMIT 50
    `).all();
  } else {
    rows = db.prepare(`
      SELECT p.id,p.text,p.image,p.createdAt,u.username as author,u.display,u.avatarColor,
        (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
      FROM posts p JOIN users u ON p.author_id = u.id
      ORDER BY p.createdAt DESC LIMIT 200
    `).all();
  }

  // attach comments when requested (light)
  rows.forEach(r => {
    r.comments = db.prepare('SELECT c.text, u.username as by, c.createdAt as at FROM comments c JOIN users u ON c.user_id=u.id WHERE c.post_id = ? ORDER BY c.createdAt ASC').all(r.id);
  });

  res.json({ posts: rows });
});

app.post('/api/posts/:id/like', authMiddleware, (req,res) => {
  const post = db.prepare('SELECT id,author_id FROM posts WHERE id = ?').get(req.params.id);
  if(!post) return res.status(404).json({ error:'post not found' });
  const exists = db.prepare('SELECT id FROM likes WHERE user_id=? AND post_id=?').get(req.user.id, post.id);
  if(exists){
    db.prepare('DELETE FROM likes WHERE id = ?').run(exists.id);
    return res.json({ ok:true, liked:false });
  } else {
    db.prepare('INSERT INTO likes(user_id, post_id) VALUES(?,?)').run(req.user.id, post.id);
    db.prepare('INSERT INTO notifications(user_id, text, at) VALUES(?,?,?)').run(post.author_id, `${req.user.username} liked your post`, new Date().toISOString());
    return res.json({ ok:true, liked:true });
  }
});

app.post('/api/posts/:id/comment', authMiddleware, (req,res) => {
  const post = db.prepare('SELECT id,author_id FROM posts WHERE id = ?').get(req.params.id);
  if(!post) return res.status(404).json({ error:'post not found' });
  const text = (req.body.text || '').trim();
  if(!text) return res.status(400).json({ error:'comment text required' });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO comments(post_id,user_id,text,createdAt) VALUES(?,?,?,?)').run(post.id, req.user.id, text, now);
  db.prepare('INSERT INTO notifications(user_id, text, at) VALUES(?,?,?)').run(post.author_id, `${req.user.username} commented: ${text.slice(0,80)}`, now);
  res.json({ ok:true });
});

// --- messages ---
app.post('/api/messages', authMiddleware, (req,res) => {
  const { to, text } = req.body;
  if(!to || !text) return res.status(400).json({ error:'to+text required' });
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(to);
  if(!target) return res.status(404).json({ error:'recipient not found' });
  const now = new Date().toISOString();
  db.prepare('INSERT INTO messages(from_id,to_id,text,createdAt) VALUES(?,?,?,?)').run(req.user.id, target.id, text, now);
  db.prepare('INSERT INTO notifications(user_id, text, at) VALUES(?,?,?)').run(target.id, `${req.user.username} sent you a message`, now);
  res.json({ ok:true });
});

app.get('/api/messages', authMiddleware, (req,res) => {
  // return simple threads summary
  const rows = db.prepare(`
    SELECT u.username as withUser, m.text as last_text, m.createdAt
    FROM messages m
    JOIN users u ON (u.id = CASE WHEN m.from_id = ? THEN m.to_id WHEN m.to_id = ? THEN m.from_id ELSE NULL END)
    WHERE m.from_id = ? OR m.to_id = ?
    GROUP BY withUser
    ORDER BY m.createdAt DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id);
  const threads = rows.map(r => ({ with: r.withUser, last_text: r.last_text }));
  res.json({ threads });
});

// --- notifications ---
app.get('/api/notifications', authMiddleware, (req,res) => {
  const rows = db.prepare('SELECT text, at FROM notifications WHERE user_id = ? ORDER BY at DESC LIMIT 50').all(req.user.id);
  res.json({ notifications: rows.map(r => ({ text: r.text, at: r.at })) });
});

// --- edit profile ---
app.put('/api/me', authMiddleware, (req,res) => {
  const display = req.body.display;
  if(display) db.prepare('UPDATE users SET display = ? WHERE id = ?').run(display, req.user.id);
  res.json({ ok:true });
});

// --- static ping ---
app.get('/api/ping', (req,res) => res.json({ ok:true }));

// --- start ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
