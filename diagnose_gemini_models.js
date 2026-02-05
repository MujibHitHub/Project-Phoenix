const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function testModel(modelName, key) {
    try {
        console.log(`Testing ${modelName}...`);
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Hi");
        const resp = await result.response;
        console.log(`${modelName} Success:`, resp.text());
        return true;
    } catch (err) {
        console.log(`${modelName} Failed:`, err.message);
        return false;
    }
}

async function start() {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const models = ["gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash", "gemini-1.5-pro"];
    for (const m of models) {
        await testModel(m, config.GEMINI_API_KEY);
    }
}

start();
