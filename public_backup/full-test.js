const steps = [
    { type: 'instruction', file: 'Examinee Information (2_1_2026 9：36：14 AM).html' },
    { type: 'instruction', file: 'Examinee Information (2_1_2026 9：37：28 AM).html' },
    { type: 'task', file: 'email-task.html', duration: 7 * 60, title: 'Writing Task 1: Email' },
    { type: 'instruction', file: 'Examinee Information (2_1_2026 9：37：53 AM).html' },
    { type: 'task', file: 'academic-task.html', duration: 10 * 60, title: 'Writing Task 2: Academic Discussion' },
    { type: 'instruction', file: 'Examinee Information (2_1_2026 9：38：04 AM).html' },
    { type: 'instruction', file: 'full-test-results.html' }
];

let currentStepIndex = 0;
const iframe = document.getElementById('test-iframe');
const progressFill = document.getElementById('progressFill');
let instructionTimerInterval = null;
let emailMasterTimerInterval = null;
let academicMasterTimerInterval = null;

const TIMER_STORAGE_KEYS = {
    'email-task.html': 'fullTest_email_time_remaining',
    'academic-task.html': 'fullTest_academic_time_remaining'
};
const EMAIL_TIMER_KEY = 'fullTest_email_time_remaining';
const EMAIL_END_KEY = 'fullTest_email_end_at_ms';
const EMAIL_STARTED_KEY = 'fullTest_email_started';
const ACADEMIC_TIMER_KEY = 'fullTest_academic_time_remaining';
const ACADEMIC_END_KEY = 'fullTest_academic_end_at_ms';
const ACADEMIC_STARTED_KEY = 'fullTest_academic_started';

function resetFullTestTimers() {
    [
        EMAIL_TIMER_KEY,
        EMAIL_END_KEY,
        EMAIL_STARTED_KEY,
        ACADEMIC_TIMER_KEY,
        ACADEMIC_END_KEY,
        ACADEMIC_STARTED_KEY
    ].forEach((k) => sessionStorage.removeItem(k));
}

function formatCountdown(seconds) {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function loadStep(index) {
    if (index >= steps.length) return;

    clearInterval(instructionTimerInterval);
    instructionTimerInterval = null;

    currentStepIndex = index;
    const step = steps[index];
    syncEmailMasterTimer(index);
    syncAcademicMasterTimer(index);
    let url = step.type === 'task' ? `${step.file}?testMode=full` : step.file;

    if (step.type === 'task') {
        const timerKey = TIMER_STORAGE_KEYS[step.file];
        const remaining = timerKey ? parseInt(sessionStorage.getItem(timerKey), 10) : NaN;
        if (!Number.isNaN(remaining) && remaining >= 0) {
            url += `&remaining=${remaining}`;
        }
    }

    console.log(`Loading step ${index + 1}: ${step.file}`);
    iframe.src = url;

    // Update progress bar
    const progress = ((index + 1) / steps.length) * 100;
    progressFill.style.width = `${progress}%`;
}

function syncEmailMasterTimer(stepIndex) {
    const emailTaskIndex = steps.findIndex(s => s.file === 'email-task.html');
    const emailInstructionIndex = emailTaskIndex + 1;
    const inEmailPhase = stepIndex === emailTaskIndex || stepIndex === emailInstructionIndex;

    if (!inEmailPhase) {
        clearInterval(emailMasterTimerInterval);
        emailMasterTimerInterval = null;
        return;
    }

    if (emailMasterTimerInterval) return;

    const defaultDuration = steps[emailTaskIndex]?.duration || 420;
    const phaseStarted = sessionStorage.getItem(EMAIL_STARTED_KEY) === '1';
    if (!phaseStarted) {
        sessionStorage.setItem(EMAIL_STARTED_KEY, '1');
        sessionStorage.setItem(EMAIL_TIMER_KEY, String(defaultDuration));
        sessionStorage.setItem(EMAIL_END_KEY, String(Date.now() + defaultDuration * 1000));
    }

    const savedEnd = parseInt(sessionStorage.getItem(EMAIL_END_KEY), 10);
    const savedRemaining = parseInt(sessionStorage.getItem(EMAIL_TIMER_KEY), 10);

    let endAtMs = savedEnd;
    if (Number.isNaN(endAtMs) || endAtMs <= Date.now()) {
        const baseRemaining = !Number.isNaN(savedRemaining) && savedRemaining >= 0 ? savedRemaining : defaultDuration;
        endAtMs = Date.now() + baseRemaining * 1000;
        sessionStorage.setItem(EMAIL_END_KEY, String(endAtMs));
    }

    const tick = () => {
        const remaining = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
        sessionStorage.setItem(EMAIL_TIMER_KEY, String(remaining));

        // If user is on Q1 time-remaining page and runs out of time, continue automatically.
        if (remaining <= 0 && currentStepIndex === emailInstructionIndex) {
            clearInterval(emailMasterTimerInterval);
            emailMasterTimerInterval = null;
            loadNextStep();
        }
    };

    tick();
    emailMasterTimerInterval = setInterval(tick, 1000);
}

function syncAcademicMasterTimer(stepIndex) {
    const academicTaskIndex = steps.findIndex(s => s.file === 'academic-task.html');
    const academicInstructionIndex = academicTaskIndex + 1;
    const inAcademicPhase = stepIndex === academicTaskIndex || stepIndex === academicInstructionIndex;

    if (!inAcademicPhase) {
        clearInterval(academicMasterTimerInterval);
        academicMasterTimerInterval = null;
        return;
    }

    if (academicMasterTimerInterval) return;

    const defaultDuration = steps[academicTaskIndex]?.duration || 600;
    const phaseStarted = sessionStorage.getItem(ACADEMIC_STARTED_KEY) === '1';
    if (!phaseStarted) {
        sessionStorage.setItem(ACADEMIC_STARTED_KEY, '1');
        sessionStorage.setItem(ACADEMIC_TIMER_KEY, String(defaultDuration));
        sessionStorage.setItem(ACADEMIC_END_KEY, String(Date.now() + defaultDuration * 1000));
    }

    const savedEnd = parseInt(sessionStorage.getItem(ACADEMIC_END_KEY), 10);
    const savedRemaining = parseInt(sessionStorage.getItem(ACADEMIC_TIMER_KEY), 10);

    let endAtMs = savedEnd;
    if (Number.isNaN(endAtMs) || endAtMs <= Date.now()) {
        const baseRemaining = !Number.isNaN(savedRemaining) && savedRemaining >= 0 ? savedRemaining : defaultDuration;
        endAtMs = Date.now() + baseRemaining * 1000;
        sessionStorage.setItem(ACADEMIC_END_KEY, String(endAtMs));
    }

    const tick = () => {
        const remaining = Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
        sessionStorage.setItem(ACADEMIC_TIMER_KEY, String(remaining));

        // While on "Time Remaining" instruction page for Q2, force-continue on timeout.
        if (remaining <= 0 && currentStepIndex === academicInstructionIndex) {
            clearInterval(academicMasterTimerInterval);
            academicMasterTimerInterval = null;
            loadNextStep();
        }
    };

    tick();
    academicMasterTimerInterval = setInterval(tick, 1000);
}

// Global listener for iframe messages
window.addEventListener('message', (event) => {
    if (event.data === 'nextStep') {
        loadNextStep();
        return;
    }

    if (event.data && typeof event.data === 'object' && event.data.type === 'nextStep') {
        loadNextStep(event.data);
    }
});

function loadNextStep(context = {}) {
    // Special rule: when Q1 timer expires on the writing page, skip Q1 time-remaining notice page.
    if (
        currentStepIndex < steps.length - 1 &&
        steps[currentStepIndex].file === 'email-task.html' &&
        context.reason === 'timeout'
    ) {
        const skipTo = currentStepIndex + 2;
        if (skipTo < steps.length) {
            loadStep(skipTo);
            return;
        }
    }

    if (currentStepIndex < steps.length - 1) {
        loadStep(currentStepIndex + 1);
    } else {
        window.location.href = 'dashboard.html';
    }
}

function loadPreviousStep() {
    if (currentStepIndex > 0) {
        loadStep(currentStepIndex - 1);
    }
}

// Inject logic into instruction pages to handle "Next" click
iframe.onload = () => {
    const step = steps[currentStepIndex];
    if (step.type === 'instruction') {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;

            // Function to handle potential navigation clicks
            const handleNavClick = (e) => {
                const target = e.target.closest('button, a, [role="button"], tc-nav-button-td, .btn, .btn-navigation');
                if (target) {
                    const text = target.textContent.trim().toLowerCase();
                    const label = target.getAttribute('label-value') || '';
                    const normalizedLabel = label.toLowerCase();

                    if (text.includes('continue') || text.includes('next') || text.includes('begin') ||
                        normalizedLabel.includes('continue') || normalizedLabel.includes('next') || normalizedLabel.includes('begin')) {

                        console.log('Intercepted navigation click:', text || label);
                        e.preventDefault();
                        e.stopPropagation();
                        loadNextStep();
                        return true;
                    }

                    if (text.includes('back') || text.includes('previous') || text.includes('return') ||
                        normalizedLabel.includes('back') || normalizedLabel.includes('previous') || normalizedLabel.includes('return')) {
                        console.log('Intercepted back click:', text || label);
                        e.preventDefault();
                        e.stopPropagation();
                        loadPreviousStep();
                        return true;
                    }
                }
                return false;
            };

            // Add global interceptor in capture phase
            doc.addEventListener('click', handleNavClick, true);

            // Also try to find and highlight the button for better UX/feedback
            let attempts = 0;
            const checkInterval = setInterval(() => {
                const buttons = Array.from(doc.querySelectorAll('button, a, [role="button"], tc-nav-button-td, .btn'));
                const navBtn = buttons.find(b => {
                    const text = b.textContent.trim().toLowerCase();
                    const label = b.getAttribute('label-value') || '';
                    const isVisible = b.offsetWidth > 0 || b.offsetHeight > 0;
                    return isVisible && (text.includes('continue') || text.includes('next') || text.includes('begin') || label.toLowerCase().includes('continue'));
                });

                if (navBtn) {
                    console.log('Detected visible navigation button');
                    // We already have the global listener, but we could add a direct one too just in case
                    navBtn.onclick = (e) => {
                        console.log('Direct button click');
                        loadNextStep();
                    };
                    clearInterval(checkInterval);
                } else if (attempts > 12) {
                    console.warn('No visible navigation button found, showing fallback');
                    showFallbackButton();
                    clearInterval(checkInterval);
                }
                attempts++;
            }, 500);

            const timerDisplay = doc.querySelector('#timerDisplayID .timer-display, .timer-display');
            const emailTaskIndex = steps.findIndex(s => s.file === 'email-task.html');
            const emailInstructionIndex = emailTaskIndex + 1;
            const academicTaskIndex = steps.findIndex(s => s.file === 'academic-task.html');
            const academicInstructionIndex = academicTaskIndex + 1;

            if (timerDisplay && (currentStepIndex === emailInstructionIndex || currentStepIndex === academicInstructionIndex)) {
                const updateInstructionTimer = () => {
                    const timerKey = currentStepIndex === emailInstructionIndex ? EMAIL_TIMER_KEY : ACADEMIC_TIMER_KEY;
                    const remaining = parseInt(sessionStorage.getItem(timerKey), 10);
                    if (!Number.isNaN(remaining)) {
                        timerDisplay.textContent = formatCountdown(remaining);
                    }
                };

                updateInstructionTimer();
                instructionTimerInterval = setInterval(updateInstructionTimer, 1000);
            }

        } catch (e) {
            console.error('Could not access iframe content (Security?)', e);
            // In case of cross-origin or other errors, show fallback
            showFallbackButton();
        }
    } else {
        // Tasks handle their own "Continue" logic via postMessage
        hideFallbackButton();
    }
};

function showFallbackButton() {
    // Hidden per user request: "remove that extra continue button at the low right corner"
    return;
}

function hideFallbackButton() {
    const fallback = document.getElementById('test-fallback-btn');
    if (fallback) fallback.style.display = 'none';
}

// Initial load
resetFullTestTimers();
loadStep(0);
