-- IPPON voting system schema

-- Sessions table (for each question/round)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_number INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Judges table
CREATE TABLE IF NOT EXISTS judges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  judge_number INTEGER NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  judge_id INTEGER NOT NULL,
  voted INTEGER NOT NULL DEFAULT 0,
  voted_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (judge_id) REFERENCES judges(id),
  UNIQUE(session_id, judge_id)
);

-- Insert initial judges
INSERT OR IGNORE INTO judges (judge_number, name) VALUES 
  (1, '審査員1'),
  (2, '審査員2'),
  (3, '審査員3'),
  (4, '審査員4'),
  (5, '審査員5');

-- Create initial session
INSERT INTO sessions (round_number, is_active) VALUES (1, 1);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
CREATE INDEX IF NOT EXISTS idx_votes_judge ON votes(judge_id);
