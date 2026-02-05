const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load configuration for fallback
let config = {};
try {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn("Warning: Could not load config.json in AI_Scoring_System", e.message);
}

const apiKeys = process.env.OPENAI_KEYS
  ? process.env.OPENAI_KEYS.split(',').map(k => k.trim())
  : (config.OPENAI_KEYS || []);

let currentKeyIndex = 0;

const getNextApiKey = () => {
  const apiKey = apiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  return apiKey;
};

const evaluateWriteAnEmail = (response) => {
  // Rubric-based scoring for Write an Email
  const rubric = {
    5: "Fully Successful",
    4: "Generally Successful",
    3: "Partially Successful",
    2: "Mostly Unsuccessful",
    1: "Unsuccessful",
    0: "No Response",
  };

  const score = calculateScore(response, rubric);
  const feedback = generateFeedback(response, rubric);

  return { score, feedback };
};

const evaluateWriteForAcademicDiscussion = (response) => {
  // Rubric-based scoring for Write for an Academic Discussion
  const rubric = {
    5: "Fully Successful",
    4: "Generally Successful",
    3: "Partially Successful",
    2: "Mostly Unsuccessful",
    1: "Unsuccessful",
    0: "No Response",
  };

  const score = calculateScore(response, rubric);
  const feedback = generateFeedback(response, rubric);

  return { score, feedback };
};

const calculateScore = async (response, rubric) => {
  const apiUrl = "https://api.openai.com/v1/engines/text-davinci-003/completions"; // Replace with the actual API endpoint

  try {
    const apiKey = getNextApiKey();
    const responseFromAPI = await axios.post(apiUrl, {
      prompt: `Evaluate the following response based on the rubric: ${JSON.stringify(rubric)}\nResponse: ${response}`,
      max_tokens: 50,
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const score = responseFromAPI.data.choices[0].text.trim(); // Adjust based on the actual API response structure
    return parseInt(score, 10) || 0; // Ensure the score is a number
  } catch (error) {
    console.error("Error while calculating score:", error);
    return 0; // Return a default score in case of an error
  }
};

const generateFeedback = (response, rubric) => {
  let feedback = "";

  // Example feedback generation based on score
  const score = calculateScore(response, rubric);

  switch (score) {
    case 5:
      feedback = "Excellent response. Well-written and comprehensive.";
      break;
    case 4:
      feedback = "Good response. Covers most points effectively.";
      break;
    case 3:
      feedback = "Average response. Some points are missing or unclear.";
      break;
    case 2:
      feedback = "Below average. Needs more detail and clarity.";
      break;
    case 1:
      feedback = "Poor response. Minimal effort or content.";
      break;
    default:
      feedback = "No response provided.";
  }

  return feedback;
};

module.exports = {
  evaluateWriteAnEmail,
  evaluateWriteForAcademicDiscussion,
};