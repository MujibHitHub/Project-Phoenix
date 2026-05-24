require('dotenv').config();
const fs = require('fs');

async function test() {
    try {
        let localConfig = {};
        try {
            if (fs.existsSync('config.json')) {
                localConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            }
        } catch (e) {}

        const openaiKey = process.env.OPENAI_API_KEY || localConfig.OPENAI_API_KEY;
        console.log('OpenAI Key:', openaiKey ? 'Present' : 'Missing');

        if (!openaiKey) {
            console.error('No OpenAI API Key found in .env or config.json');
            return;
        }

        console.log('Testing OpenAI...');
        const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: "Say 'Hello OpenAI is working'" }]
            })
        });
        const oaData = await oaRes.json();
        console.log('OpenAI Status:', oaRes.status);
        if (oaData.choices) {
            console.log('OpenAI Response:', oaData.choices[0].message.content);
        } else {
            console.log('OpenAI Error:', JSON.stringify(oaData));
        }
    } catch (err) {
        console.error('DIAGNOSTIC FAILED:', err);
    }
}

test();
