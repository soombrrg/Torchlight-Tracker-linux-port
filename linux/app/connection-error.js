document.getElementById('site').textContent = new URLSearchParams(location.search).get('url') || '';
document.getElementById('retry').addEventListener('click', async (event) => {
  event.target.disabled = true;
  try {
    await window.electronAPI.forceReload();
  } finally {
    event.target.disabled = false;
  }
});
document.getElementById('close').addEventListener('click', () => window.electronAPI.closeWindow());
