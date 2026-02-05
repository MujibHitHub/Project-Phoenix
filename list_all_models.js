const fs = require('fs');

async function testRawGemini() {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const key = config.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${key}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.models) {
            fs.writeFileSync('available_models.json', JSON.stringify(data.models, null, 2));
            console.log('Saved available models to available_models.json');
        } else {
            console.log('Error:', JSON.stringify(data));
        }
    } catch (err) {
        console.error('Failed:', err);
    }
}

testRawGemini();
