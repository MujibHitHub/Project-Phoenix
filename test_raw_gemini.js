const fs = require('fs');

async function testRawGemini() {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const key = config.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${key}`;

    try {
        console.log('Fetching available Gemini models...');
        const res = await fetch(url);
        const data = await res.json();
        console.log('Status:', res.status);
        if (data.models) {
            console.log('Available Models:', data.models.map(m => m.name).join(', '));
        } else {
            console.log('Error Data:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Raw Fetch Failed:', err);
    }
}

testRawGemini();
