import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// API: Get current session status
app.get('/api/status', async (c) => {
  try {
    const db = c.env.DB

    // Get active session
    const session = await db.prepare(`
      SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1
    `).first()

    if (!session) {
      return c.json({ error: 'No active session' }, 404)
    }

    // Get all judges
    const judges = await db.prepare(`
      SELECT * FROM judges ORDER BY judge_number
    `).all()

    // Get votes for current session
    const votes = await db.prepare(`
      SELECT v.*, j.judge_number, j.name 
      FROM votes v
      JOIN judges j ON v.judge_id = j.id
      WHERE v.session_id = ?
    `).bind(session.id).all()

    const votesMap = votes.results.reduce((acc: any, vote: any) => {
      acc[vote.judge_number] = vote.voted === 1
      return acc
    }, {})

    const voteCount = votes.results.filter((v: any) => v.voted === 1).length
    const isIppon = voteCount >= 3

    return c.json({
      sessionId: session.id,
      roundNumber: session.round_number,
      judges: judges.results,
      votes: votesMap,
      voteCount,
      isIppon,
      timestamp: Date.now()
    })
  } catch (error) {
    console.error('Status error:', error)
    return c.json({ error: 'Failed to get status' }, 500)
  }
})

// API: Submit vote
app.post('/api/vote', async (c) => {
  try {
    const db = c.env.DB
    const { judgeNumber } = await c.req.json()

    if (!judgeNumber || judgeNumber < 1 || judgeNumber > 5) {
      return c.json({ error: 'Invalid judge number' }, 400)
    }

    // Get active session
    const session = await db.prepare(`
      SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1
    `).first()

    if (!session) {
      return c.json({ error: 'No active session' }, 404)
    }

    // Get judge
    const judge = await db.prepare(`
      SELECT * FROM judges WHERE judge_number = ?
    `).bind(judgeNumber).first()

    if (!judge) {
      return c.json({ error: 'Judge not found' }, 404)
    }

    // Toggle vote
    const existingVote = await db.prepare(`
      SELECT * FROM votes WHERE session_id = ? AND judge_id = ?
    `).bind(session.id, judge.id).first()

    if (existingVote) {
      // Toggle vote
      const newVoted = existingVote.voted === 1 ? 0 : 1
      await db.prepare(`
        UPDATE votes SET voted = ?, voted_at = CURRENT_TIMESTAMP 
        WHERE session_id = ? AND judge_id = ?
      `).bind(newVoted, session.id, judge.id).run()
    } else {
      // Insert new vote
      await db.prepare(`
        INSERT INTO votes (session_id, judge_id, voted, voted_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      `).bind(session.id, judge.id).run()
    }

    return c.json({ success: true })
  } catch (error) {
    console.error('Vote error:', error)
    return c.json({ error: 'Failed to submit vote' }, 500)
  }
})

// API: Reset current session
app.post('/api/reset', async (c) => {
  try {
    const db = c.env.DB

    // Get active session
    const session = await db.prepare(`
      SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1
    `).first()

    if (session) {
      // Mark current session as inactive
      await db.prepare(`
        UPDATE sessions SET is_active = 0 WHERE id = ?
      `).bind(session.id).run()
    }

    // Create new session
    const nextRound = session ? (session.round_number as number) + 1 : 1
    await db.prepare(`
      INSERT INTO sessions (round_number, is_active) VALUES (?, 1)
    `).bind(nextRound).run()

    return c.json({ success: true, roundNumber: nextRound })
  } catch (error) {
    console.error('Reset error:', error)
    return c.json({ error: 'Failed to reset session' }, 500)
  }
})

// API: YO button press
app.post('/api/yo', async (c) => {
  try {
    const db = c.env.DB
    const { judgeNumber } = await c.req.json()

    if (!judgeNumber || judgeNumber < 1 || judgeNumber > 5) {
      return c.json({ error: 'Invalid judge number' }, 400)
    }

    // Get active session
    const session = await db.prepare(`
      SELECT * FROM sessions WHERE is_active = 1 ORDER BY id DESC LIMIT 1
    `).first()

    if (!session) {
      return c.json({ error: 'No active session' }, 404)
    }

    // Get judge
    const judge = await db.prepare(`
      SELECT * FROM judges WHERE judge_number = ?
    `).bind(judgeNumber).first()

    if (!judge) {
      return c.json({ error: 'Judge not found' }, 404)
    }

    // Record YO event
    await db.prepare(`
      INSERT INTO yo_events (session_id, judge_id) VALUES (?, ?)
    `).bind(session.id, judge.id).run()

    return c.json({ success: true, timestamp: Date.now() })
  } catch (error) {
    console.error('YO error:', error)
    return c.json({ error: 'Failed to record YO' }, 500)
  }
})

// API: Get latest YO event
app.get('/api/yo/latest', async (c) => {
  try {
    const db = c.env.DB

    // Get latest YO event
    const yoEvent = await db.prepare(`
      SELECT ye.*, j.judge_number, j.name
      FROM yo_events ye
      JOIN judges j ON ye.judge_id = j.id
      ORDER BY ye.created_at DESC
      LIMIT 1
    `).first()

    if (!yoEvent) {
      return c.json({ hasYo: false })
    }

    return c.json({ 
      hasYo: true, 
      judgeNumber: yoEvent.judge_number,
      judgeName: yoEvent.name,
      timestamp: yoEvent.created_at
    })
  } catch (error) {
    console.error('Get YO error:', error)
    return c.json({ error: 'Failed to get YO' }, 500)
  }
})

// PC Display Page and Judge Screens
app.get('/', (c) => {
  // Check if this is a judge screen
  const judgeNumber = c.req.query('judge')
  
  // If judge parameter exists, show judge screen
  if (judgeNumber) {
    const judgeNum = parseInt(judgeNumber)
    if (judgeNum >= 1 && judgeNum <= 5) {
      return renderJudgeScreen(c, judgeNum)
    }
  }
  
  // Otherwise show PC display
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>素人一本 投票集計画面</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          body {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          }
          .judge-card {
            transition: all 0.3s ease;
            background: #1f2937;
            border: 3px solid #fbbf24;
          }
          .judge-card.voted {
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
            transform: scale(1.08);
            box-shadow: 0 15px 40px rgba(220, 38, 38, 0.6);
            border-color: #fef3c7;
          }
          .ippon-banner {
            animation: slideIn 0.5s ease-out, pulse-glow 1s infinite alternate;
          }
          @keyframes slideIn {
            from { transform: translateY(-100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes pulse-glow {
            from { box-shadow: 0 0 20px rgba(220, 38, 38, 0.5); }
            to { box-shadow: 0 0 40px rgba(220, 38, 38, 0.9); }
          }
          .pulse {
            animation: pulse 0.8s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
          .logo-container {
            background: rgba(255, 255, 255, 0.95);
            border: 4px solid #1f2937;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-7xl mx-auto">
            <!-- Header with Logo -->
            <div class="text-center mb-8">
                <div class="logo-container inline-block rounded-3xl p-4 mb-6">
                    <img src="/suppon-logo.png" alt="素人一本" class="h-32 w-auto">
                </div>
                <h1 class="text-6xl font-black mb-6" style="color: #1f2937; text-shadow: 3px 3px 0px #fef3c7, 6px 6px 0px rgba(0,0,0,0.2);">
                    投票集計画面
                </h1>
                <div class="flex justify-center items-center gap-4">
                    <div class="bg-gray-900 rounded-xl px-8 py-4 border-4 border-yellow-300 shadow-xl">
                        <p class="text-yellow-300 text-2xl font-bold">ラウンド <span id="roundNumber" class="text-4xl">1</span></p>
                    </div>
                    <div class="bg-gray-900 rounded-xl px-8 py-4 border-4 border-yellow-300 shadow-xl">
                        <p class="text-yellow-300 text-2xl font-bold">合計 <span id="totalVotes" class="text-4xl">0</span> / 5</p>
                    </div>
                </div>
            </div>

            <!-- IPPON Banner -->
            <div id="ipponBanner" class="hidden ippon-banner mb-8">
                <div class="bg-gradient-to-r from-red-600 via-red-700 to-red-800 rounded-3xl shadow-2xl p-10 text-center border-8 border-yellow-300">
                    <div class="mb-4">
                        <img src="/suppon-logo.png" alt="素人一本" class="h-24 w-auto mx-auto opacity-90">
                    </div>
                    <h2 class="text-8xl font-black text-yellow-300 mb-4" style="text-shadow: 4px 4px 0px rgba(0,0,0,0.5);">
                        一本！
                    </h2>
                    <p class="text-yellow-100 text-3xl font-bold">3名以上が判定しました！</p>
                </div>
            </div>

            <!-- Judges Grid -->
            <div class="grid grid-cols-5 gap-6 mb-8">
                <div id="judge1" class="judge-card rounded-2xl p-6 text-center shadow-2xl">
                    <div class="text-6xl mb-4">👤</div>
                    <h3 class="text-2xl font-bold mb-3 text-yellow-300">審査員1</h3>
                    <div class="h-20 flex items-center justify-center">
                        <i class="fas fa-circle text-gray-600 text-5xl" id="icon1"></i>
                    </div>
                </div>
                <div id="judge2" class="judge-card rounded-2xl p-6 text-center shadow-2xl">
                    <div class="text-6xl mb-4">👤</div>
                    <h3 class="text-2xl font-bold mb-3 text-yellow-300">審査員2</h3>
                    <div class="h-20 flex items-center justify-center">
                        <i class="fas fa-circle text-gray-600 text-5xl" id="icon2"></i>
                    </div>
                </div>
                <div id="judge3" class="judge-card rounded-2xl p-6 text-center shadow-2xl">
                    <div class="text-6xl mb-4">👤</div>
                    <h3 class="text-2xl font-bold mb-3 text-yellow-300">審査員3</h3>
                    <div class="h-20 flex items-center justify-center">
                        <i class="fas fa-circle text-gray-600 text-5xl" id="icon3"></i>
                    </div>
                </div>
                <div id="judge4" class="judge-card rounded-2xl p-6 text-center shadow-2xl">
                    <div class="text-6xl mb-4">👤</div>
                    <h3 class="text-2xl font-bold mb-3 text-yellow-300">審査員4</h3>
                    <div class="h-20 flex items-center justify-center">
                        <i class="fas fa-circle text-gray-600 text-5xl" id="icon4"></i>
                    </div>
                </div>
                <div id="judge5" class="judge-card rounded-2xl p-6 text-center shadow-2xl">
                    <div class="text-6xl mb-4">👤</div>
                    <h3 class="text-2xl font-bold mb-3 text-yellow-300">審査員5</h3>
                    <div class="h-20 flex items-center justify-center">
                        <i class="fas fa-circle text-gray-600 text-5xl" id="icon5"></i>
                    </div>
                </div>
            </div>

            <!-- Control Buttons -->
            <div class="text-center">
                <button id="resetBtn" class="bg-red-600 hover:bg-red-700 text-white font-black text-2xl py-6 px-12 rounded-3xl border-6 border-yellow-300 shadow-2xl transition-all hover:scale-110 hover:shadow-yellow-300/70">
                    <i class="fas fa-redo-alt mr-4 text-3xl"></i>
                    ラウンドリセット
                </button>
            </div>
        </div>

        <audio id="ipponSound" preload="auto">
            <source src="/ippon.m4a" type="audio/mp4">
        </audio>

        <audio id="yoSound" preload="auto">
            <source src="/yo-sound.m4a" type="audio/mp4">
        </audio>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/pc.js"></script>
    </body>
    </html>
  `)
})


// Helper function to render judge screen
function renderJudgeScreen(c: any, judgeNumber: number) {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>素人一本 - 審査員${judgeNumber}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            touch-action: manipulation;
            overflow: hidden;
          }
          .ippon-button {
            transition: all 0.15s ease;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
            position: relative;
            overflow: hidden;
          }
          .ippon-button:active {
            transform: scale(0.92);
          }
          .success-flash {
            animation: flashSuccess 0.5s ease-out;
          }
          @keyframes flashSuccess {
            0%, 100% { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); }
            50% { background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); }
          }
          .ripple {
            position: absolute;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.7);
            width: 100px;
            height: 100px;
            margin-top: -50px;
            margin-left: -50px;
            animation: ripple-effect 0.6s;
            pointer-events: none;
          }
          @keyframes ripple-effect {
            from {
              opacity: 1;
              transform: scale(0);
            }
            to {
              opacity: 0;
              transform: scale(5);
            }
          }
          .logo-float {
            animation: float 3s ease-in-out infinite;
          }
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
        </style>
    </head>
    <body class="flex items-center justify-center min-h-screen">
        <div class="w-full h-screen flex flex-col items-center justify-center px-6" id="container">
            <!-- Logo -->
            <div class="text-center mb-10 logo-float">
                <div class="bg-white rounded-3xl p-4 inline-block shadow-2xl border-4 border-gray-900">
                    <img src="/suppon-logo.png" alt="素人一本" class="h-24 w-auto">
                </div>
            </div>

            <!-- Judge Info -->
            <div class="text-center mb-12">
                <div class="bg-gray-900 rounded-2xl px-8 py-4 inline-block border-4 border-yellow-300 shadow-2xl mb-4">
                    <h1 class="text-5xl font-black text-yellow-300" style="text-shadow: 2px 2px 0px rgba(0,0,0,0.3);">審査員 ${judgeNumber}</h1>
                </div>
                <p class="text-gray-900 text-2xl font-bold mt-4">一本と思ったらタップ！</p>
            </div>

            <!-- IPPON Button -->
            <button id="ipponBtn" class="ippon-button w-full max-w-2xl h-96 rounded-full bg-gradient-to-br from-red-600 to-red-800 shadow-2xl flex flex-col items-center justify-center border-8 border-gray-900 mb-8">
                <div class="text-yellow-300 text-9xl font-black mb-4" style="text-shadow: 4px 4px 0px rgba(0,0,0,0.5); letter-spacing: 0.05em;">SUPPON</div>
                <div class="text-yellow-300 text-7xl">👆</div>
            </button>

            <!-- YO Button -->
            <button id="yoBtn" class="ippon-button w-full max-w-2xl h-64 rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-2xl flex items-center justify-center border-8 border-gray-900">
                <div class="text-yellow-300 font-black" style="font-size: 10rem; text-shadow: 4px 4px 0px rgba(0,0,0,0.5); letter-spacing: 0.1em;">YO〜</div>
            </button>

            <!-- Feedback Messages -->
            <div id="feedback" class="mt-8 text-center opacity-0 transition-opacity duration-300">
                <div class="bg-gray-900 rounded-2xl px-10 py-6 inline-block border-4 border-yellow-300 shadow-2xl">
                    <div class="text-yellow-300 text-4xl font-black">✓ 送信完了</div>
                </div>
            </div>
            
            <div id="yoFeedback" class="mt-4 text-center opacity-0 transition-opacity duration-300">
                <div class="bg-blue-900 rounded-2xl px-10 py-6 inline-block border-4 border-blue-300 shadow-2xl">
                    <div class="text-blue-300 text-4xl font-black">✓ YO〜送信</div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/judge.js"></script>
    </body>
    </html>
  `)
}

// Judge Vote Page (supports both /judge/:number and /?judge=X)
app.get('/judge/:number', (c) => {
  const judgeNumber = parseInt(c.req.param('number'))
  return renderJudgeScreen(c, judgeNumber)
})

export default app
