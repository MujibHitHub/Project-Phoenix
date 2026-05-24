require('dotenv').config();
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
    let localConfig = {};
    try {
        if (fs.existsSync('config.json')) {
            localConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        }
    } catch (e) {}

    const geminiKey = process.env.GEMINI_API_KEY || localConfig.GEMINI_API_KEY;
    const models = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
    for (const m of models) {
        await testModel(m, geminiKey);
    }
}

start();
