const fs = require('fs');
const path = require('path');

const emailPath = path.join(__dirname, 'Write an Email scenarios.txt');
const academicPath = path.join(__dirname, 'Write for an Academic discussion scenarios.txt');
const outputPath = path.join(__dirname, 'senarioo.json');

function parseEmail() {
    const content = fs.readFileSync(emailPath, 'utf8');
    const scenarios = content.split(/Scenario \d+/).filter(s => s.trim().length > 0);

    return scenarios.map((s, index) => {
        const taskStartRegex = /Write an email to/i;
        const match = s.match(taskStartRegex);

        if (!match) {
            // Fallback if structure varies
            return {
                id: `e${index + 1}`,
                scenario: `Scenario: ${s.trim()}`,
                task: "Write an email."
            };
        }

        const splitIndex = match.index;
        const scenarioText = s.substring(0, splitIndex).trim();
        // Capture everything after "Write an email to..." including bullets
        let taskAndBullets = s.substring(splitIndex).trim();

        // Clean up excessive newlines to make it look nice
        taskAndBullets = taskAndBullets.replace(/\n\s*\n/g, '\n').trim();

        const fullScenarioText = `Scenario: ${scenarioText}\n\nTask: ${taskAndBullets}`;

        // Extract just the first line/sentence for the short 'task' header
        const firstLineEnd = taskAndBullets.indexOf('\n');
        const shortTask = firstLineEnd !== -1 ? taskAndBullets.substring(0, firstLineEnd).trim() : taskAndBullets;

        return {
            id: `e${index + 1}`,
            scenario: fullScenarioText,
            task: shortTask
        };
    });
}

function parseAcademic() {
    const content = fs.readFileSync(academicPath, 'utf8');
    const scenarios = content.split(/Scenario \d+/).filter(s => s.trim().length > 0);

    return scenarios.map((s, index) => {
        const lines = s.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Scenario 1 (Education & Pedagogy) -> Topic
        const firstLine = lines[0];
        const topicMatch = firstLine.match(/\((.+)\)/);
        const topic = topicMatch ? topicMatch[1] : "General";

        // Your professor is teaching a class on ...
        const classLine = lines.find(l => l.toLowerCase().includes('teaching a class on'));
        const profIndex = lines.findIndex(l => l.startsWith('Professor:'));
        const claireIndex = lines.findIndex(l => l.startsWith('Claire:'));
        const alexIndex = lines.findIndex(l => l.startsWith('Alex:'));

        const profPrompt = profIndex !== -1 ? lines[profIndex] : "";
        const clairePost = claireIndex !== -1 ? lines[claireIndex] : "";
        const alexPost = alexIndex !== -1 ? lines[alexIndex] : "";

        // Construct composite scenario string as expected by UI
        // Topic: ... Professor: ... Claire: ... Alex: ...
        const scenario = `Topic: ${topic}\n${profPrompt}\n${clairePost}\n${alexPost}`;

        return {
            id: `a${index + 1}`,
            scenario: scenario,
            topic: topic
        };
    });
}

const data = {
    email: parseEmail(),
    academic: parseAcademic()
};

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Generated senarioo.json with ${data.email.length} email scenarios and ${data.academic.length} academic scenarios.`);
