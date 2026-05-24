// Settings panel logic — persists to localStorage, loads on startup

interface Settings {
    petSize: 'small' | 'medium' | 'large';
    moveSpeed: 'slow' | 'medium' | 'fast';
    followDist: 'close' | 'medium' | 'far';
    soundEffects: boolean;
}

const DEFAULTS: Settings = {
    petSize: 'medium',
    moveSpeed: 'medium',
    followDist: 'medium',
    soundEffects: false,
};

const STORAGE_KEY = 'screenfox-settings';

function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULTS, ...parsed };
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return { ...DEFAULTS };
}

function saveSettings(settings: Settings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        showStatus('Settings saved!');
    } catch (e) {
        console.error('Failed to save settings:', e);
        showStatus('Failed to save settings');
    }
}

function showStatus(msg: string): void {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('saved');
    setTimeout(() => {
        el.classList.remove('saved');
        el.textContent = 'Settings auto-saved';
    }, 2000);
}

function getRadioValue(name: string): string {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    return el ? el.value : '';
}

function setRadioValue(name: string, value: string): void {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
}

function init(): void {
    const settings = loadSettings();

    // Apply loaded settings to UI
    setRadioValue('petSize', settings.petSize);
    setRadioValue('moveSpeed', settings.moveSpeed);
    setRadioValue('followDist', settings.followDist);
    const soundEl = document.getElementById('soundEffects') as HTMLInputElement;
    if (soundEl) soundEl.checked = settings.soundEffects;

    // Listen for changes on all radio buttons
    document.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((input) => {
        input.addEventListener('change', () => {
            const current = loadSettings();
            const name = input.name;
            const value = input.value;

            switch (name) {
                case 'petSize':
                    current.petSize = value as Settings['petSize'];
                    break;
                case 'moveSpeed':
                    current.moveSpeed = value as Settings['moveSpeed'];
                    break;
                case 'followDist':
                    current.followDist = value as Settings['followDist'];
                    break;
            }
            saveSettings(current);
        });
    });

    // Listen for sound effects toggle
    if (soundEl) {
        soundEl.addEventListener('change', () => {
            const current = loadSettings();
            current.soundEffects = soundEl.checked;
            saveSettings(current);
        });
    }

    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            saveSettings({ ...DEFAULTS });
            setRadioValue('petSize', DEFAULTS.petSize);
            setRadioValue('moveSpeed', DEFAULTS.moveSpeed);
            setRadioValue('followDist', DEFAULTS.followDist);
            if (soundEl) soundEl.checked = DEFAULTS.soundEffects;
            showStatus('Reset to defaults');
        });
    }

    // Expose settings globally so the pet window can read them
    (window as any).__SCREENFOX_SETTINGS__ = settings;
}

init();
