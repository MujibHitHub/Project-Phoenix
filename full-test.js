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

function loadStep(index) {
    if (index >= steps.length) return;

    currentStepIndex = index;
    const step = steps[index];
    const url = step.type === 'task' ? `${step.file}?testMode=full` : step.file;

    console.log(`Loading step ${index + 1}: ${step.file}`);
    iframe.src = url;

    // Update progress bar
    const progress = ((index + 1) / steps.length) * 100;
    progressFill.style.width = `${progress}%`;
}

// Global listener for iframe messages
window.addEventListener('message', (event) => {
    if (event.data === 'nextStep') {
        loadNextStep();
    }
});

function loadNextStep() {
    if (currentStepIndex < steps.length - 1) {
        loadStep(currentStepIndex + 1);
    } else {
        window.location.href = 'dashboard.html';
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

                    if (text.includes('continue') || text.includes('next') || text.includes('begin') ||
                        label.toLowerCase().includes('continue') || label.toLowerCase().includes('next') || label.toLowerCase().includes('begin')) {

                        console.log('Intercepted navigation click:', text || label);
                        e.preventDefault();
                        e.stopPropagation();
                        loadNextStep();
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
loadStep(0);
