// Original desktop path-getter shape from the shipped Vue bundle.
const fn = false;
const vn = window.electronAPI;
const Hn = async () => {if(!fn||"function"!=typeof vn.getGameLogPath)return"";try{return vn.getGameLogPath()}catch(e){return""}};
window.restartLikeOriginalWorker = async () => {
  await vn.stopTorLog();
  const logPath = await Hn();
  if (logPath) await vn.startTorLog(logPath);
  return logPath;
};
