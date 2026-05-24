require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

async function test() {
    try {
        let localConfig = {};
        try {
            if (fs.existsSync('config.json')) {
                localConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            }
        } catch (e) {}

        const geminiKey = process.env.GEMINI_API_KEY || localConfig.GEMINI_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY || localConfig.OPENAI_API_KEY;

        console.log('Gemini Key:', geminiKey ? 'Present' : 'Missing');
        console.log('OpenAI Key:', openaiKey ? 'Present' : 'Missing');

        if (geminiKey) {
            console.log('Testing Gemini...');
            try {
                const genAI = new GoogleGenerativeAI(geminiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const result = await model.generateContent("Hello, are you working?");
                const response = await result.response;
                console.log('Gemini Response:', response.text());
            } catch (e) {
                console.error('Gemini Test Failed:', e.message);
            }
        }

        if (openaiKey) {
            console.log('Testing OpenAI...');
            try {
                const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openaiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: "Hello" }]
                    })
                });
                const oaData = await oaRes.json();
                console.log('OpenAI Status:', oaRes.status);
                if (oaData.choices) {
                    console.log('OpenAI Response:', oaData.choices[0].message.content);
                } else {
                    console.log('OpenAI Error:', JSON.stringify(oaData));
                }
            } catch (e) {
                console.error('OpenAI Test Failed:', e.message);
            }
        }
    } catch (err) {
        console.error('DIAGNOSTIC FAILED:', err);
    }
}

test();
