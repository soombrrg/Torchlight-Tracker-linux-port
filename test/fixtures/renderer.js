window.receivedLogLines = [];
window.electronAPI.onLogMsg((line) => window.receivedLogLines.push(line));
window.fixtureReady = true;
