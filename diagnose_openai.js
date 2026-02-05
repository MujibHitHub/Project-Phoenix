const fs = require('fs');

async function test() {
    try {
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        console.log('OpenAI Key:', config.OPENAI_API_KEY ? 'Present' : 'Missing');

        console.log('Testing OpenAI...');
        const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
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
