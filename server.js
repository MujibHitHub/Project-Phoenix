const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Load configuration (Environment Variables first, then config.json)
let localConfig = {};
try {
    if (fs.existsSync(CONFIG_FILE)) {
        localConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
} catch (e) {
    console.warn("Warning: Could not load config.json", e.message);
}

const config = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || localConfig.GEMINI_API_KEY,
    OPENAI_KEYS: process.env.OPENAI_KEYS
        ? process.env.OPENAI_KEYS.split(',').map(k => k.trim())
        : (localConfig.OPENAI_KEYS || [])
};

// Initialize with a fallback or the actual key
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY || "Missing_Key");

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve static files from current dir

// Helper to read users
const getUsers = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, '[]', 'utf8');
            return [];
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading users file:", err);
        return [];
    }
};

// Helper to write users
const saveUsers = (users) => {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing users file:", err);
    }
};

// Helper to read sessions
const getSessions = () => {
    try {
        if (!fs.existsSync(SESSIONS_FILE)) {
            fs.writeFileSync(SESSIONS_FILE, '[]', 'utf8');
            return [];
        }
        const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading sessions file:", err);
        return [];
    }
};

// Helper to write sessions
const saveSessions = (sessions) => {
    try {
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing sessions file:", err);
    }
};

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.json({ success: true, message: 'Login successful', username });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Register Endpoint
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();

    if (users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'User already exists' });
    }

    users.push({ username, password });
    saveUsers(users);
    res.json({ success: true, message: 'User registered successfully' });
});

// Get all sessions for a user
app.get('/api/sessions/:username', (req, res) => {
    const { username } = req.params;
    const sessions = getSessions();
    const userSessions = sessions.filter(s => s.userId === username);
    res.json({ success: true, sessions: userSessions });
});

// Get specific session
app.get('/api/sessions/:username/:sessionId', (req, res) => {
    const { username, sessionId } = req.params;
    const sessions = getSessions();
    const session = sessions.find(s => s.userId === username && s.id === sessionId);

    if (session) {
        res.json({ success: true, session });
    } else {
        res.status(404).json({ success: false, message: 'Session not found' });
    }
});

// Save new session
app.post('/api/sessions', (req, res) => {
    const sessionData = req.body;
    const sessions = getSessions();

    // Generate unique session ID
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newSession = {
        id: sessionId,
        ...sessionData,
        date: new Date().toISOString()
    };

    sessions.push(newSession);
    saveSessions(sessions);
    res.json({ success: true, session: newSession });
});

// AI Evaluation Endpoint
app.post('/api/evaluate', async (req, res) => {
    try {
        const { taskType, userResponse, scenario } = req.body;

        const rubricsPrompt = taskType === 'email' ?
            `ETS TOEFL 2026 "Write an Email" Criteria (0-5 raw scale):
            - 5: Fully Successful. Clearly expressed, effective, consistent facility. Elaboration supports purpose. Precise/idiomatic word choice.
            - 4: Generally Successful. Mostly effective, easily understood. Adequate elaboration. Appropriate word choice.
            - 3: Partially Successful. Accomplishes task but limitations prevent full clarity. Partial support. Moderate range of syntax/vocab.
            - 2: Mostly Unsuccessful. Mostly ineffective. Limited elaboration. Errors in structure/language.
            - 1: Unsuccessful. Ineffective attempt. Very little elaboration. Serious/frequent errors.
            - 0: Blank, off-topic, or copied.` :
            `ETS TOEFL 2026 "Academic Discussion" Criteria (0-5 raw scale):
            - 5: Fully Successful. Relevant and clearly expressed. Well-elaborated explanations/examples. Effective syntactic variety.
            - 4: Generally Successful. Relevant contribution. Ideas easily understood. Adequate elaboration.
            - 3: Partially Successful. Mostly relevant but some parts missing or unclear. Some variety in syntax.
            - 2: Mostly Unsuccessful. Limitations make ideas hard to follow. Poorly elaborated.
            - 1: Unsuccessful. Ineffective attempt. Words/phrases with few coherent ideas.
            - 0: Blank, off-topic, or copied.` ;

        const prompt = `You are a professional TOEFL iBT examiner evaluating a 2026 Writing task.
Task Type: ${taskType === 'email' ? 'Write an Email' : 'Academic Discussion'}
Scenario Context: ${scenario}

Student Response:
"${userResponse}"

Detailed Rubrics (0-5):
${rubricsPrompt}

Your task:
1. Assign a raw score from 0.0 to 5.0 based on the rubrics.
2. Provide a scaled score from 0 to 30 (Raw Score * 6).
3. Provide comprehensive feedback on specific strengths and weaknesses by pointing to each part of the user's response. Be specific about which sentences or phrases worked or didn't work.

Provide your evaluation in this JSON format:
{
  "rawScore": [Number 0.0-5.0],
  "scaledScore": [Number 0-30],
  "breakdown": {
    "taskAchievement": [0-5],
    "organization": [0-5],
    "languageUse": [0-5],
    "grammar": [0-5]
  },
  "strengths": ["specific strength referencing part of text", ...],
  "weaknesses": ["specific weakness referencing part of text", ...],
  "detailedFeedback": "Comprehensive feedback summary."
}
Return ONLY JSON.`;

        let evaluation = null;

        // 1. Try Gemini Keys Pool (Rotation Strategy)
        const geminiKeys = config.GEMINI_KEYS_POOL || (config.GEMINI_API_KEY ? [config.GEMINI_API_KEY] : []);

        if (geminiKeys.length > 0) {
            console.log(`[Evaluation] Found ${geminiKeys.length} Gemini keys. Starting rotation...`);

            // Try several model versions for each key if needed, or just stick to a stable one
            const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];

            mainLoop: for (let i = 0; i < geminiKeys.length; i++) {
                const key = geminiKeys[i];
                console.log(`[Evaluation] Attempting Gemini Key #${i + 1}...`);

                try {
                    const genAI_instance = new GoogleGenerativeAI(key);

                    for (const modelName of modelsToTry) {
                        try {
                            const model = genAI_instance.getGenerativeModel({
                                model: modelName,
                                safetySettings: [
                                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                                ]
                            });

                            console.log(`[Evaluation] Key #${i + 1} - Model: ${modelName} - Generating...`);
                            const result = await model.generateContent(prompt);
                            const resp = await result.response;
                            const text = resp.text();

                            const jsonMatch = text.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                evaluation = JSON.parse(jsonMatch[0]);
                                evaluation.source = `ai (gemini-key-${i + 1})`;
                                console.log(`[Evaluation] SUCCESS with Key #${i + 1} (${modelName}).`);
                                break mainLoop;
                            }
                        } catch (e) {
                            if (e.message.includes("429") || e.message.includes("Quota")) {
                                console.warn(`[Evaluation] Key #${i + 1} Quota Exceeded. Switching to next key...`);
                                break; // Break inner model loop to go to next key
                            }
                            console.warn(`[Evaluation] Key #${i + 1} (${modelName}) error: ${e.message}`);
                        }
                    }
                } catch (e) {
                    console.error(`[Evaluation] Fatal error with Key #${i + 1}:`, e.message);
                }
            }
        }

        // 2. Fallback to Gemini if OpenAI failed
        if (!evaluation && config.GEMINI_API_KEY) {
            console.log('[Evaluation] All OpenAI keys failed or missing. Falling back to Gemini...');
            try {
                const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-2.0-flash-exp"];
                for (const modelName of modelsToTry) {
                    try {
                        console.log(`[Evaluation] Attempting Gemini (${modelName})...`);
                        const model = genAI.getGenerativeModel({
                            model: modelName,
                            safetySettings: [
                                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                            ]
                        });
                        const result = await model.generateContent(prompt);
                        const resp = await result.response;
                        const text = resp.text();
                        console.log(`[Evaluation] Gemini (${modelName}) Raw response snippet:`, text.substring(0, 100) + "...");

                        const jsonMatch = text.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            evaluation = JSON.parse(jsonMatch[0]);
                            evaluation.source = 'ai (gemini)';
                            console.log(`[Evaluation] Gemini (${modelName}) SUCCESS.`);
                            break;
                        } else {
                            console.warn(`[Evaluation] Gemini (${modelName}) output not JSON.`);
                        }
                    } catch (e) {
                        console.warn(`[Evaluation] Gemini (${modelName}) failed: ${e.message}`);
                        if (e.response && e.response.promptFeedback) {
                            console.warn(`[Evaluation] Prompt Feedback:`, JSON.stringify(e.response.promptFeedback));
                        }
                    }
                }
            } catch (e) { console.error('[Evaluation] Gemini Fatal Exception:', e.message); }
        }

        if (evaluation) {
            res.json({ success: true, evaluation });
        } else {
            console.error('[Evaluation] ALL AI FAILED. Key/Quota or model issues.');
            res.json({ success: true, evaluation: getFallbackEvaluation(userResponse), source: 'fallback' });
        }
    } catch (e) {
        console.error('Fatal Evaluation Error:', e);
        res.status(500).json({ success: false, message: 'Evaluation failed' });
    }
});

// Heuristic fallback evaluation
function getFallbackEvaluation(userResponse) {
    const wordCount = userResponse.trim().split(/\s+/).length;
    let score = 0;

    // Simple length-based scoring for fallback
    if (wordCount > 150) score = 85;
    else if (wordCount > 100) score = 75;
    else if (wordCount > 50) score = 65;
    else score = 50;

    // Add some randomness
    score += Math.floor(Math.random() * 10);

    return {
        overallScore: score,
        breakdown: {
            taskAchievement: Math.floor(score / 4),
            organization: Math.floor(score / 4),
            languageUse: Math.floor(score / 4),
            grammar: Math.floor(score / 4)
        },
        strengths: ["Proper structure used", "Clear message conveyed"],
        improvements: ["Expand on your ideas", "Use more varied vocabulary"],
        detailedFeedback: "This is a fallback evaluation as the AI service was temporarily unavailable. Your response was analyzed based on length and structure."
    };
}

const SCENARIOS_FILE = path.join(__dirname, 'senarioo.json');

// Helper to get scenarios from file
const getScenarios = () => {
    try {
        if (!fs.existsSync(SCENARIOS_FILE)) {
            return { email: [], academic: [] };
        }
        return JSON.parse(fs.readFileSync(SCENARIOS_FILE, 'utf8'));
    } catch (err) {
        console.error("Error reading scenarios file:", err);
        return { email: [], academic: [] };
    }
};

// AI scenario endpoint (now pulls from pre-generated pool)
// AI scenario endpoint - Now pulls from pre-generated pool with NO-REPEAT logic
app.get('/api/scenarios/generate-ai', async (req, res) => {
    try {
        const { type, username } = req.query;
        if (!type) {
            return res.status(400).json({ success: false, message: 'Type is required' });
        }

        const scenarios = getScenarios();
        const pool = type === 'email' ? scenarios.email : scenarios.academic;

        if (!pool || pool.length === 0) {
            throw new Error(`No scenarios found for type: ${type}`);
        }

        let selected = null;

        if (username) {
            const users = getUsers();
            const userIndex = users.findIndex(u => u.username === username);

            if (userIndex !== -1) {
                if (!users[userIndex].seenScenarios) {
                    users[userIndex].seenScenarios = [];
                }

                // Filter out seen scenarios
                let availableScenarios = pool.filter(s => !users[userIndex].seenScenarios.includes(s.id));

                if (availableScenarios.length === 0) {
                    // All scenarios seen! Reset tracking for this type
                    console.log(`[Scenario] User ${username} has seen all ${type} scenarios. Resetting pool.`);
                    users[userIndex].seenScenarios = users[userIndex].seenScenarios.filter(id => !pool.map(ps => ps.id).includes(id));
                    availableScenarios = pool;
                }

                selected = availableScenarios[Math.floor(Math.random() * availableScenarios.length)];

                // Track this pick
                users[userIndex].seenScenarios.push(selected.id);
                saveUsers(users);
                console.log(`[Scenario] Serving ${type} scenario "${selected.id}" to ${username}.`);
            }
        }

        // Fallback to purely random if no username provided or user not found
        if (!selected) {
            selected = pool[Math.floor(Math.random() * pool.length)];
            console.log(`[Scenario] Serving random ${type} scenario: ${selected.id} (Guest/Fallback)`);
        }

        res.json({ success: true, scenario: selected.scenario, id: selected.id });
    } catch (error) {
        console.error('Scenario serving error:', error);
        res.status(500).json({ success: false, message: 'Failed to serve scenario' });
    }
});

// Helper to generate scenario (repurposed for fetching from pool if needed internally)
async function generateFallbackScenario(type) {
    const scenarios = getScenarios();
    const pool = type === 'email' ? scenarios.email : scenarios.academic;
    if (pool && pool.length > 0) {
        const selected = pool[Math.floor(Math.random() * pool.length)];
        return selected.scenario;
    }
    return "Scenario: Default fallback scenario text.";
}

// Get Email scenarios
app.get('/api/scenarios/email', async (req, res) => {
    try {
        const scenarios = getScenarios();
        if (scenarios.email.length === 0) throw new Error("No email scenarios found");
        res.json({ success: true, scenarios: scenarios.email.map(s => s.scenario) });
    } catch (error) {
        console.error("Email scenario error:", error);
        res.status(500).json({ success: false, message: 'Failed to load email scenarios' });
    }
});

// Get Academic Discussion scenarios
app.get('/api/scenarios/academic', async (req, res) => {
    try {
        const scenarios = getScenarios();
        if (scenarios.academic.length === 0) throw new Error("No academic scenarios found");
        res.json({ success: true, scenarios: scenarios.academic.map(s => s.scenario) });
    } catch (error) {
        console.error("Academic scenario error:", error);
        res.status(500).json({ success: false, message: 'Failed to load academic scenarios' });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log('Gemini AI integration: ACTIVE');
    });
}

module.exports = app;
