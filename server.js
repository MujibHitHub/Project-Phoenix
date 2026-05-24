require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
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
    GEMINI_KEYS_POOL: process.env.GEMINI_KEYS_POOL
        ? process.env.GEMINI_KEYS_POOL.split(',').map(k => k.trim())
        : (localConfig.GEMINI_KEYS_POOL || []),
    OPENAI_KEYS: process.env.OPENAI_KEYS
        ? process.env.OPENAI_KEYS.split(',').map(k => k.trim())
        : (localConfig.OPENAI_KEYS || []),
    SUPABASE_URL: process.env.SUPABASE_URL || localConfig.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || localConfig.SUPABASE_ANON_KEY
};

// Initialize with a fallback or the actual key
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY || "Missing_Key");

// Initialize Supabase client
const supabase = config.SUPABASE_URL && config.SUPABASE_ANON_KEY 
    ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    : null;

app.use(cors());
app.use(bodyParser.json());
// Serve static files only for local development/runtime.
// On Vercel production, static assets under /public are served directly by Vercel CDN.
if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// Login Endpoint - Supabase email/password
app.post('/api/login', async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Supabase not configured' });
        }

        const { username, password, email } = req.body;
        const loginEmail = (email || username || '').trim().toLowerCase();
        if (!loginEmail || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        if (!loginEmail.includes('@')) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password
        });

        if (error) {
            return res.status(401).json({ success: false, message: error.message });
        }

        const profile = await getUserProfile(data.user.id);
        const displayName = profile?.username || data.user.user_metadata?.username || loginEmail.split('@')[0];

        res.json({
            success: true,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user_id: data.user.id,
            email: data.user.email,
            username: displayName
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// Register Endpoint - Supabase email/password
app.post('/api/register', async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({ success: false, message: 'Supabase not configured' });
        }

        const { username, password, email } = req.body;
        const registerEmail = (email || username || '').trim().toLowerCase();
        const displayName = (username || registerEmail.split('@')[0] || 'user').trim();

        if (!registerEmail || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        if (!registerEmail.includes('@')) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const { data, error } = await supabase.auth.signUp({
            email: registerEmail,
            password,
            options: {
                data: { username: displayName }
            }
        });

        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        if (data.user) {
            await supabase.from('user_profiles').upsert({
                user_id: data.user.id,
                content: JSON.stringify({ username: displayName, seenScenarios: [] })
            }, { onConflict: 'user_id' });
        }

        if (!data.session) {
            return res.json({
                success: true,
                requiresConfirmation: true,
                message: 'Account created. Check your email to confirm, then sign in.'
            });
        }

        res.json({
            success: true,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user_id: data.user.id,
            email: data.user.email,
            username: displayName
        });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// OAuth Callback Endpoint
app.get('/api/auth/callback', async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({ success: false, message: 'No code provided' });
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        res.redirect(`/login.html?access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&user_id=${data.user.id}&email=${encodeURIComponent(data.user.email || '')}`);
    } catch (e) {
        console.error('OAuth callback error:', e);
        res.status(500).json({ success: false, message: 'OAuth callback failed' });
    }
});

async function getUserProfile(userId) {
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('content')
        .eq('user_id', userId)
        .single();

    if (!profile?.content) return null;
    try {
        return JSON.parse(profile.content);
    } catch {
        return null;
    }
}

function mapSessionForDashboard(row) {
    const evaluation = row.evaluation || {};
    const taskType = row.task_type || evaluation.taskType || 'email';

    if (taskType === 'full-test' || evaluation.details) {
        const emailEval = evaluation.details?.email || {};
        const academicEval = evaluation.details?.academic || {};
        const emailScore = emailEval.scaledScore ? Math.round((emailEval.scaledScore / 30) * 100) : (emailEval.overallScore || 0);
        const academicScore = academicEval.scaledScore ? Math.round((academicEval.scaledScore / 30) * 100) : (academicEval.overallScore || 0);
        const avgScore = Math.round((emailScore + academicScore) / 2);

        return {
            id: row.id,
            taskType: 'full-test',
            score: evaluation.score || avgScore,
            date: row.created_at,
            details: evaluation.details,
            feedback: evaluation.feedback || {
                breakdown: { taskAchievement: 0, organization: 0, languageUse: 0, grammar: 0 },
                strengths: [],
                improvements: [],
                detailedFeedback: evaluation.detailedFeedback || ''
            }
        };
    }

    const feedback = evaluation.feedback || {
        breakdown: {
            taskAchievement: Math.round((evaluation.breakdown?.taskAchievement || 0) * 5),
            organization: Math.round((evaluation.breakdown?.organization || 0) * 5),
            languageUse: Math.round((evaluation.breakdown?.languageUse || 0) * 5),
            grammar: Math.round((evaluation.breakdown?.grammar || 0) * 5)
        },
        strengths: evaluation.strengths || [],
        improvements: evaluation.weaknesses || evaluation.improvements || [],
        detailedFeedback: evaluation.detailedFeedback || ''
    };

    let score = evaluation.score;
    if (typeof score !== 'number') {
        if (typeof evaluation.scaledScore === 'number') score = Math.round((evaluation.scaledScore / 30) * 100);
        else if (typeof evaluation.overallScore === 'number') score = Math.round(evaluation.overallScore);
        else if (typeof evaluation.rawScore === 'number') score = Math.round((evaluation.rawScore / 5) * 100);
        else score = 0;
    }

    return {
        id: row.id,
        taskType: taskType,
        score,
        date: row.created_at,
        feedback
    };
}

// Get all sessions for a user - Supabase (using access token)
app.get('/api/sessions', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No access token provided' });
        }

        const accessToken = authHeader.substring(7);

        // Verify the access token and get user
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !user) {
            return res.status(401).json({ success: false, message: 'Invalid access token' });
        }

        // Fetch sessions from Supabase
        const { data: sessions, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, message: error.message });
        }

        res.json({ success: true, sessions: (sessions || []).map(mapSessionForDashboard) });
    } catch (e) {
        console.error('Get sessions error:', e);
        res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
    }
});

// Get specific session - Supabase (using access token)
app.get('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No access token provided' });
        }

        const accessToken = authHeader.substring(7);

        // Verify the access token and get user
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !user) {
            return res.status(401).json({ success: false, message: 'Invalid access token' });
        }

        // Fetch specific session from Supabase
        const { data: session, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (error || !session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        res.json({ success: true, session });
    } catch (e) {
        console.error('Get session error:', e);
        res.status(500).json({ success: false, message: 'Failed to fetch session' });
    }
});

// Save new session - Supabase (using access token)
app.post('/api/sessions', async (req, res) => {
    try {
        const sessionData = req.body;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No access token provided' });
        }

        const accessToken = authHeader.substring(7);

        // Verify the access token and get user
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !user) {
            return res.status(401).json({ success: false, message: 'Invalid access token' });
        }

        const evaluationPayload = {
            ...(sessionData.evaluation || {}),
            score: sessionData.score,
            feedback: sessionData.feedback,
            details: sessionData.details,
            taskType: sessionData.taskType
        };

        // Insert session into Supabase
        const { data: session, error } = await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                task_type: sessionData.taskType,
                scenario_id: sessionData.scenarioId || null,
                scenario_text: sessionData.scenario || sessionData.scenarioText || null,
                user_response: sessionData.userResponse || null,
                evaluation: evaluationPayload
            })
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, message: error.message });
        }

        res.json({ success: true, session: mapSessionForDashboard(session) });
    } catch (e) {
        console.error('Save session error:', e);
        res.status(500).json({ success: false, message: 'Failed to save session' });
    }
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
            const modelsToTry = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];

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
                const modelsToTry = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];
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
        const { type } = req.query;
        const authHeader = req.headers.authorization;
        
        if (!type) {
            return res.status(400).json({ success: false, message: 'Type is required' });
        }

        const scenarios = getScenarios();
        const pool = type === 'email' ? scenarios.email : scenarios.academic;

        if (!pool || pool.length === 0) {
            throw new Error(`No scenarios found for type: ${type}`);
        }

        let selected = null;

        if (authHeader && supabase) {
            // Use Supabase for user tracking with access token
            if (!authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, message: 'Invalid authorization header' });
            }

            const accessToken = authHeader.substring(7);

            // Verify the access token and get user
            const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
            if (userError || !user) {
                return res.status(401).json({ success: false, message: 'Invalid access token' });
            }

            // Get user's seen scenarios from user_profiles
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('content')
                .eq('user_id', user.id)
                .single();

            let seenScenarios = [];
            if (profile && profile.content) {
                try {
                    const profileData = JSON.parse(profile.content);
                    seenScenarios = profileData.seenScenarios || [];
                } catch (e) {
                    console.error('Error parsing profile content:', e);
                }
            }

            // Filter out seen scenarios
            let availableScenarios = pool.filter(s => !seenScenarios.includes(s.id));

            if (availableScenarios.length === 0) {
                // All scenarios seen! Reset tracking for this type
                console.log(`[Scenario] User ${user.email} has seen all ${type} scenarios. Resetting pool.`);
                seenScenarios = seenScenarios.filter(id => !pool.map(ps => ps.id).includes(id));
                availableScenarios = pool;
            }

            selected = availableScenarios[Math.floor(Math.random() * availableScenarios.length)];

            // Track this pick in Supabase
            seenScenarios.push(selected.id);
            const { error: updateError } = await supabase
                .from('user_profiles')
                .upsert({
                    user_id: user.id,
                    content: JSON.stringify({ seenScenarios })
                }, {
                    onConflict: 'user_id'
                });

            if (updateError) {
                console.error('Error updating user profile:', updateError);
            }

            console.log(`[Scenario] Serving ${type} scenario "${selected.id}" to ${user.email}.`);
        }

        // Fallback to purely random if no auth provided
        if (!selected) {
            selected = pool[Math.floor(Math.random() * pool.length)];
            console.log(`[Scenario] Serving random ${type} scenario: ${selected.id} (No auth)`);
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
