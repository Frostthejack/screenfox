const container = document.getElementById('pet-container')!;
let leaveTimeout: ReturnType<typeof setTimeout> | null = null;
let isDragging = false;

// Enable pointer-events on mouse enter (cancel any pending disable)
container.addEventListener('mouseenter', () => {
    if (leaveTimeout) {
        clearTimeout(leaveTimeout);
        leaveTimeout = null;
    }
    container.style.pointerEvents = 'auto';
});

// Disable pointer-events after 100ms delay on mouse leave
container.addEventListener('mouseleave', () => {
    leaveTimeout = setTimeout(() => {
        container.style.pointerEvents = '';
    }, 100);
});

// Track dragging state and toggle 'dragging' class
container.addEventListener('mousedown', () => {
    isDragging = true;
    container.classList.add('dragging');
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        container.classList.remove('dragging');
    }
});
