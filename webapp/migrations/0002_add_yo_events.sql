-- YO events table for tracking YO button presses
CREATE TABLE IF NOT EXISTS yo_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  judge_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (judge_id) REFERENCES judges(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_yo_events_session ON yo_events(session_id);
CREATE INDEX IF NOT EXISTS idx_yo_events_created ON yo_events(created_at);
