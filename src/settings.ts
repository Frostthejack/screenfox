// Settings panel logic — persists via Tauri backend, propagates to pet window in real-time

import { invoke } from '@tauri-apps/api/core';

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

async function loadSettings(): Promise<Settings> {
    try {
        const s = await invoke<Settings>('get_settings');
        return { ...DEFAULTS, ...s };
    } catch (e) {
        console.error('Failed to load settings:', e);
        return { ...DEFAULTS };
    }
}

async function saveSettings(settings: Settings): Promise<void> {
    try {
        await invoke('update_settings', { settings });
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

async function init(): Promise<void> {
    const settings = await loadSettings();

    // Apply loaded settings to UI
    setRadioValue('petSize', settings.petSize);
    setRadioValue('moveSpeed', settings.moveSpeed);
    setRadioValue('followDist', settings.followDist);
    const soundEl = document.getElementById('soundEffects') as HTMLInputElement;
    if (soundEl) soundEl.checked = settings.soundEffects;

    // Helper: read all current UI values and save them
    function currentFromUI(): Settings {
        return {
            petSize: (getRadioValue('petSize') || settings.petSize) as Settings['petSize'],
            moveSpeed: (getRadioValue('moveSpeed') || settings.moveSpeed) as Settings['moveSpeed'],
            followDist: (getRadioValue('followDist') || settings.followDist) as Settings['followDist'],
            soundEffects: soundEl ? soundEl.checked : settings.soundEffects,
        };
    }

    // Listen for changes on all radio buttons
    document.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((input) => {
        input.addEventListener('change', async () => {
            await saveSettings(currentFromUI());
        });
    });

    // Listen for sound effects toggle
    if (soundEl) {
        soundEl.addEventListener('change', async () => {
            await saveSettings(currentFromUI());
        });
    }

    // Reset button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            await saveSettings({ ...DEFAULTS });
            setRadioValue('petSize', DEFAULTS.petSize);
            setRadioValue('moveSpeed', DEFAULTS.moveSpeed);
            setRadioValue('followDist', DEFAULTS.followDist);
            if (soundEl) soundEl.checked = DEFAULTS.soundEffects;
            showStatus('Reset to defaults');
        });
    }

    // Expose settings globally (for debugging)
    (window as any).__SCREENFOX_SETTINGS__ = settings;
}

init();
