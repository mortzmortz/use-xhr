// adapted from: https://github.com/okonet/attr-accept/blob/master/src/index.js
// returns true if file.name is empty and accept string is something like ".csv",
// because file comes from dataTransferItem for drag events, and
// dataTransferItem.name is always empty
export function accepts(file, accept) {
  if (!accept || accept === '*') return true;
  const mimeType = file.type || '';
  const baseMimeType = mimeType.replace(/\/.*$/, '');
  return accept
    .split(',')
    .map(t => t.trim())
    .some(type => {
      if (type.charAt(0) === '.') {
        return (
          file.name === undefined ||
          file.name.toLowerCase().endsWith(type.toLowerCase())
        );
      } else if (type.endsWith('/*')) {
        // this is something like an image/* mime type
        return baseMimeType === type.replace(/\/.*$/, '');
      }
      return mimeType === type;
    });
}

export function getFilesFromEvent(event) {
  let items = null;
  if ('dataTransfer' in event) {
    const dt = event.dataTransfer;
    // NOTE: Only the 'drop' event has access to DataTransfer.files, otherwise it will always be empty
    if ('files' in dt && dt.files.length) {
      items = dt.files;
    } else if (dt.items && dt.items.length) {
      items = dt.items;
    }
  } else if (event.target && event.target.files) {
    items = event.target.files;
  }
  return Array.prototype.slice.call(items);
}

export function getEstimatedSeconds(starttime, progress) {
  const timePassed = Date.now() - new Date(starttime);
  const estimated = (100 - progress) * (timePassed / progress);
  const estimatedSeconds = Math.floor((estimated / 1000) % 60);
  return estimatedSeconds || 0;
}

function isIe(userAgent) {
  return (
    userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident/') !== -1
  );
}

function isEdge(userAgent) {
  return userAgent.indexOf('Edge/') !== -1;
}

export function isIeOrEdge(userAgent = window.navigator.userAgent) {
  return isIe(userAgent) || isEdge(userAgent);
}
