import React from 'react';
import {
  accepts,
  getFilesFromEvent as defaultGetFilesFromEvent,
  getEstimatedSeconds,
  isIeOrEdge,
} from './utils';
import uuidv1 from 'uuid/v1';

const noop = () => {};

function useXhr({
  getUploadParams = noop,
  getChunkName = noop,
  minSizeBytes = 0,
  maxSizeBytes = Number.MAX_SAFE_INTEGER,
  maxFiles = Number.MAX_SAFE_INTEGER,
  accept = '*',
  autoUpload = true,
  timeout = 0,
  validate = noop,
  noClick = false,
  multiple = true,
  disabled = false,
  chunks = false,
  chunkSize = 512 * 1024,
  getFilesFromEvent = defaultGetFilesFromEvent,
  getDataTransferItemsFromEvent = defaultGetFilesFromEvent,
} = {}) {
  const xhrs = React.useRef([]);
  const mountedRef = React.useRef(true);
  const inputRef = React.useRef(null);
  const activeDragRef = React.useRef(0);
  const draggedRef = React.useRef([]);
  const rootRef = React.useRef(null);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [isFocus, setIsFocus] = React.useState(false);
  const [files, dispatch] = React.useReducer(fileReducer, []);

  const handleUploadError = ({ status }) => {
    switch (status) {
      case 404:
        console.error('File not found');
        break;
      case 500:
        console.error('Server error');
        break;
      case 0:
        console.error('Request aborted');
        break;
      default:
        console.error('Unknown error ' + status);
    }
  };

  const updateFileProgress = useEventCallback(
    (fileWithMeta, progress, status) => {
      const fileToUpdate = files.filter(
        file => file.meta.id === fileWithMeta.meta.id
      )[0];
      if (status === 'uploading') {
        dispatch({
          type: 'UPDATE_PROGRESS',
          payload: {
            id: fileToUpdate.meta.id,
            progress,
            estimated: getEstimatedSeconds(
              fileWithMeta.meta.uploadedDate,
              progress
            ),
          },
        });
        return;
      }

      dispatch({
        type: 'UPDATE_STATUS',
        payload: { id: fileToUpdate.meta.id, status: 'done' },
      });
    }
  );

  const allChunksFinished = chunkProgress =>
    chunkProgress.every(progress => progress === 'done');

  const updateFileChunkProgress = useEventCallback(
    (fileWithMeta, chunkIndex, chunkProgress, status) => {
      const { id } = fileWithMeta.meta;
      const fileToUpdate = files.filter(file => file.meta.id === id)[0];
      const newChunkProgress = [...fileToUpdate.meta.chunkProgress];
      const totalProgress =
        newChunkProgress.reduce(
          (a, b) =>
            (typeof a === 'number' ? a : 100) +
            (typeof b === 'number' ? b : 100),
          0
        ) / newChunkProgress.length;
      newChunkProgress[chunkIndex] = status === 'done' ? 'done' : chunkProgress;

      // Update Progress
      dispatch({
        type: 'UPDATE_PROGRESS',
        payload: {
          id,
          progress: totalProgress,
          chunkProgress: newChunkProgress,
          estimated: getEstimatedSeconds(
            fileWithMeta.meta.uploadedDate,
            totalProgress
          ),
        },
      });

      // Set file status to done if all chunks finished uploading
      if (allChunksFinished(newChunkProgress)) {
        dispatch({
          type: 'UPDATE_STATUS',
          payload: { id, status: 'done' },
        });
      }
    }
  );

  // TODO: compare uploadFile and uploadChunk
  // => a lot of duplicate code
  const uploadFile = React.useCallback(
    (fileWithMeta, progressCallback) => {
      const fileToUpload = fileWithMeta;
      if (!getUploadParams) return;

      let params = null;
      try {
        params = getUploadParams(fileToUpload);
      } catch (e) {
        console.error('Error Upload Params', e.stack);
      }

      if (params === null || params.url === null) return;

      const { url, method = 'POST', body, fields = {}, headers = {} } = params;
      const { id, size } = fileToUpload.meta;

      if (!url) {
        dispatch({
          type: 'UPDATE_STATUS',
          payload: { id, status: 'error_upload_params' },
        });
        return;
      }

      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      xhr.open(method, url, true);
      for (const field of Object.keys(fields)) {
        formData.append(field, fields[field]);
      }
      xhr.setRequestHeader('X-Content-Length', size);
      xhr.setRequestHeader('X-Content-Id', id);

      for (const header of Object.keys(headers)) {
        xhr.setRequestHeader(header, headers[header]);
      }

      xhr.onload = () => {
        progressCallback(100, 'done');
        delete xhrs.current[id];
      };
      xhr.onerror = () => handleUploadError(xhr);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          progressCallback((event.loaded / event.total) * 100, 'uploading');
        }
      };

      formData.append('file', fileToUpload.file);
      if (timeout) xhr.timeout = timeout;
      xhr.send(body || formData);

      xhrs.current[id] = xhr;

      dispatch({
        type: 'SET_UPLOADING',
        payload: id,
      });
    },
    [getUploadParams, timeout]
  );

  const uploadChunk = React.useCallback(
    (chunk, chunkIndex, fileWithMeta, progressCallback) => {
      if (chunk) {
        const fileToUpload = fileWithMeta;
        if (!getUploadParams) return;

        let params = null;
        try {
          params = getUploadParams();
        } catch (e) {
          console.error('Error Upload Params', e.stack);
        }

        if (params === null || params.url === null) return;
        const { name, size, id } = fileToUpload.meta;

        const {
          url,
          method = 'POST',
          body,
          fields = {},
          headers = {},
        } = params;
        const chunkId = getChunkName
          ? getChunkName(fileToUpload, chunkIndex)
          : `${name}-${chunkIndex}`;

        const formData = new FormData();
        const xhr = new XMLHttpRequest();

        xhr.open(method, url, true);
        for (const field of Object.keys(fields)) {
          formData.append(field, fields[field]);
        }
        xhr.setRequestHeader('X-Content-Name', name);
        xhr.setRequestHeader('X-Content-Length', size);
        xhr.setRequestHeader('X-Content-Id', id);
        xhr.setRequestHeader('X-Chunk-Length', chunk.size);
        xhr.setRequestHeader('X-Chunk-Id', chunkId);

        for (const header of Object.keys(headers)) {
          xhr.setRequestHeader(header, headers[header]);
        }

        xhr.onload = () => {
          progressCallback(100, chunkIndex, 'done');
          delete xhrs.current[chunkId];
        };
        xhr.onerror = () => handleUploadError(xhr);
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) {
            progressCallback(
              (event.loaded / event.total) * 100,
              chunkIndex,
              'uploading'
            );
          }
        };

        formData.append('chunk', chunk);
        if (timeout) xhr.timeout = timeout;
        xhr.send(body || formData);

        xhrs.current[`${fileWithMeta.meta.id}-${chunkId}`] = xhr;

        dispatch({
          type: 'SET_UPLOADING',
          payload: fileWithMeta.meta.id,
        });
      }
    },
    [getChunkName, getUploadParams, timeout]
  );

  const upload = React.useCallback(
    fileWithMeta => {
      if (chunks && typeof chunkSize === 'number') {
        const BYTES_PER_CHUNK = chunkSize;
        const SIZE = fileWithMeta.meta.size;

        let start = 0;
        let end = BYTES_PER_CHUNK;

        let chunkIndex = 0;
        while (start < SIZE) {
          uploadChunk(
            fileWithMeta.file.slice(start, end),
            chunkIndex,
            fileWithMeta,
            (percentage, chunkIndex, status) =>
              updateFileChunkProgress(
                fileWithMeta,
                chunkIndex,
                percentage,
                status
              )
          );
          chunkIndex += 1;
          start = end;
          end = start + BYTES_PER_CHUNK;
        }
      } else {
        uploadFile(fileWithMeta, (progress, status) =>
          updateFileProgress(fileWithMeta, progress, status)
        );
      }
    },
    [
      chunkSize,
      chunks,
      updateFileChunkProgress,
      updateFileProgress,
      uploadChunk,
      uploadFile,
    ]
  );

  const getFileById = id => files.filter(file => file.meta.id === id)[0];

  const abortUpload = fileToAbort => {
    const { id, chunkProgress } = fileToAbort.meta;
    if (chunkProgress.length) {
      for (let key in xhrs.current) {
        if (key.includes(id)) {
          xhrs.current[key].abort();
        }
      }
    } else {
      xhrs.current[id].abort();
    }
  };

  const cancel = useEventCallback(fileWithMeta => {
    const { id } = fileWithMeta.meta;
    const fileToCancel = getFileById(id);
    if (fileToCancel && fileToCancel.meta.status === 'uploading') {
      abortUpload(fileToCancel);
      dispatch({
        type: 'CANCEL_UPLOAD',
        payload: id,
      });
    }
  });

  const restart = useEventCallback(fileWithMeta => {
    const { id } = fileWithMeta.meta;
    const fileToRestart = getFileById(id);
    if (fileToRestart) {
      cancel(fileToRestart);
      fileToRestart.meta.status = 'getting_upload_params';
      fileToRestart.meta.progress = 0;
      if (fileToRestart.meta.chunkProgress) {
        const cleared = fileToRestart.meta.chunkProgress.map(p => 0);
        fileToRestart.meta.chunkProgress = cleared;
      }
      upload(fileToRestart);
    }
  });

  const remove = useEventCallback(fileWithMeta => {
    const { id } = fileWithMeta.meta;
    const fileToRemove = getFileById(id);
    if (fileToRemove) {
      if (fileToRemove.meta.previewUrl) {
        URL.revokeObjectURL(fileToRemove.meta.previewUrl || '');
      }
      if (fileToRemove.meta.status === 'uploading') {
        abortUpload(fileToRemove);
      }
      dispatch({
        type: 'REMOVE_FILE_BY_ID',
        payload: id,
      });
    }
  });

  const handleFile = React.useCallback(
    async (file, id) => {
      const { name, size, type, lastModified } = file;
      const uploadedDate = new Date().toISOString();
      const lastModifiedDate =
        lastModified && new Date(lastModified).toISOString();
      let chunkProgress = null;

      if (typeof chunkSize === 'number') {
        chunkProgress = [];
        for (let j = 0; j <= file.size / chunkSize; j += 1) {
          chunkProgress.push(0);
        }
      }

      const fileWithMeta = {
        file,
        meta: {
          name,
          size,
          type,
          lastModifiedDate,
          uploadedDate,
          progress: 0,
          chunkProgress,
          id,
          estimated: 0,
        },
      };

      // Firefox versions prior to 53 return a bogus mime type for file drag events,
      // so files with that mime type are always accepted
      if (file.type !== 'application/x-moz-file' && !accepts(file, accept)) {
        fileWithMeta.meta.status = 'rejected_file_type';
        dispatch({ type: 'ADD_FILE', payload: fileWithMeta });
        return;
      }

      if (files.length >= maxFiles) {
        fileWithMeta.meta.status = 'rejected_max_files';
        dispatch({ type: 'ADD_FILE', payload: fileWithMeta });
        return;
      }

      if (size < minSizeBytes || size > maxSizeBytes) {
        fileWithMeta.meta.status = 'error_file_size';
        dispatch({ type: 'ADD_FILE', payload: fileWithMeta });
        return;
      }

      if (validate) {
        const error = validate(fileWithMeta);
        if (error) {
          fileWithMeta.meta.status = 'error_validation';
          fileWithMeta.meta.validationError = error;
          dispatch({ type: 'ADD_FILE', payload: fileWithMeta });
          return;
        }
      }

      fileWithMeta.meta.status = autoUpload ? 'getting_upload_params' : 'ready';

      fileWithMeta.cancel = () => cancel(fileWithMeta);
      fileWithMeta.remove = () => remove(fileWithMeta);
      fileWithMeta.restart = () => restart(fileWithMeta);

      const fileWithMetaAndPreview = await generatePreview(fileWithMeta);

      dispatch({ type: 'ADD_FILE', payload: fileWithMetaAndPreview });
      if (autoUpload) {
        upload(fileWithMetaAndPreview);
      }
    },
    [
      chunkSize,
      accept,
      files.length,
      maxFiles,
      minSizeBytes,
      maxSizeBytes,
      validate,
      autoUpload,
      cancel,
      remove,
      restart,
      upload,
    ]
  );

  // Expects an array of File objects
  const handleFiles = React.useCallback(
    addedFiles => {
      addedFiles.forEach(file => handleFile(file, uuidv1()));
    },
    [handleFile]
  );

  const openFileDialog = () => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  };

  const onDragEnter = React.useCallback(
    async event => {
      event.preventDefault();
      event.stopPropagation();
      const dragged = await getDataTransferItemsFromEvent(event);
      draggedRef.current = dragged;
      activeDragRef.current += 1;
      setIsDragActive(activeDragRef.current > 0);
    },
    [getDataTransferItemsFromEvent]
  );

  const onDragOver = React.useCallback(event => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return false;
  }, []);

  const onDragLeave = React.useCallback(event => {
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = [];
    activeDragRef.current -= 1;
    if (activeDragRef.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const onDrop = React.useCallback(
    async event => {
      event.preventDefault();
      event.stopPropagation();
      draggedRef.current = [];
      activeDragRef.current = 0;
      setIsDragActive(false);
      const droppedFiles = await getFilesFromEvent(event);
      handleFiles(droppedFiles);
    },
    [getFilesFromEvent, handleFiles]
  );

  const onDropDisabled = event => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  };

  const onFocus = () => setIsFocus(true);

  const onBlur = () => setIsFocus(false);

  const onClick = React.useCallback(() => {
    if (noClick) {
      return;
    }

    // TODO: test in IE if we need this
    // https://github.com/react-dropzone/react-dropzone/blob/master/src/index.js#L465
    // In IE11/Edge the file-browser dialog is blocking, therefore, use set = 0()
    if (isIeOrEdge()) {
      setTimeout(openFileDialog, 0);
    } else {
      openFileDialog();
    }
  }, [noClick]);

  const onKeyDown = React.useCallback(
    event => {
      // Ignore keyboard events bubbling up the DOM tree
      if (!rootRef.current || !rootRef.current.isEqualNode(event.target)) {
        return;
      }

      // Open file dialog with 'space' and 'enter' keys
      if (event.keyCode === 32 || event.keyCode === 13) {
        event.preventDefault();
        openFileDialog();
      }
    },
    [rootRef]
  );

  const generatePreview = async fileWithMeta => {
    const {
      meta: { type },
      file,
    } = fileWithMeta;
    const preview = {};
    const isImage = type.startsWith('image/');
    const isAudio = type.startsWith('audio/');
    const isVideo = type.startsWith('video/');

    if (!isImage && !isAudio && !isVideo) return;

    const objectUrl = URL.createObjectURL(file);
    const fileCallbackToPromise = fileObj => {
      return new Promise(resolve => {
        if (fileObj instanceof HTMLImageElement) fileObj.onload = resolve;
        else fileObj.onloadedmetadata = resolve;
      });
    };

    try {
      if (isImage) {
        const img = new Image();
        img.src = objectUrl;
        preview.previewUrl = objectUrl;
        await fileCallbackToPromise(img);
        preview.width = img.width;
        preview.height = img.height;
      }

      if (isAudio) {
        const audio = new Audio();
        audio.src = objectUrl;
        await fileCallbackToPromise(audio);
        preview.duration = audio.duration;
      }

      if (isVideo) {
        const video = document.createElement('video');
        video.src = objectUrl;
        await fileCallbackToPromise(video);
        preview.duration = video.duration;
        preview.videoWidth = video.videoWidth;
        preview.videoHeight = video.videoHeight;
      }

      if (!isImage) URL.revokeObjectURL(objectUrl);
    } catch (e) {
      URL.revokeObjectURL(objectUrl);
    }

    return {
      ...fileWithMeta,
      meta: {
        ...fileWithMeta.meta,
        ...preview,
      },
    };
  };

  const isDragReject = draggedRef.current.some(
    file => file.type !== 'application/x-moz-file' && !accepts(file, accept)
  );

  const extra = {
    accept,
    multiple,
    minSizeBytes,
    maxSizeBytes,
    maxFiles,
  };

  const getRootProps = React.useMemo(
    () => ({ refKey = 'ref', ...rest } = {}) => ({
      onDragEnter,
      onDragOver,
      onDragLeave,
      onFocus,
      onBlur,
      onKeyDown,
      onClick,
      onDrop: !disabled ? onDrop : onDropDisabled,
      ...(!disabled ? { tabIndex: 0 } : {}),
      [refKey]: rootRef,
      ...rest,
    }),
    [onDragEnter, onDragOver, onDragLeave, onKeyDown, onClick, disabled, onDrop]
  );

  const getInputProps = React.useMemo(
    () => ({ refKey = 'ref', onChange, ...rest } = {}) => ({
      accept,
      multiple,
      type: 'file',
      style: { display: 'none' },
      onChange: async event => {
        event.persist();
        const chosenFiles = await getFilesFromEvent(event);
        handleFiles(chosenFiles);
        event.target.value = null;
      },
      autoComplete: 'off',
      tabIndex: -1,
      disabled: disabled !== undefined ? disabled : noClick,
      [refKey]: inputRef,
      ...rest,
    }),
    [accept, multiple, disabled, noClick, getFilesFromEvent, handleFiles]
  );

  React.useEffect(() => {
    const connections = xhrs.current;
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      connections.forEach(connection => connection.abort());
    };
  }, []);

  return {
    files,
    extra,
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    isFocus,
    inputRef,
  };
}

function fileReducer(files, action) {
  switch (action.type) {
    case 'ADD_FILE': {
      return [...files, action.payload];
    }
    case 'REMOVE_FILE_BY_ID': {
      return files.filter(file => file.meta.id !== action.payload);
    }
    case 'RESET': {
      return [];
    }
    case 'CANCEL_UPLOAD': {
      return files.map(file => {
        if (file.meta.id !== action.payload) {
          return file;
        } else {
          return {
            ...file,
            meta: {
              ...file.meta,
              status: 'aborted',
            },
          };
        }
      });
    }
    case 'UPDATE_STATUS': {
      return files.map(file => {
        if (file.meta.id !== action.payload.id) {
          return file;
        } else {
          return {
            ...file,
            meta: {
              ...file.meta,
              status: action.payload.status,
            },
          };
        }
      });
    }
    case 'UPDATE_PROGRESS': {
      return files.map(file => {
        if (file.meta.id !== action.payload.id) {
          return file;
        } else {
          return {
            ...file,
            meta: {
              ...file.meta,
              progress: action.payload.progress,
              chunkProgress: action.payload.chunkProgress || [],
              estimated: action.payload.estimated || 0,
            },
          };
        }
      });
    }
    case 'SET_UPLOADING': {
      return files.map(file => {
        if (file.meta.id !== action.payload) {
          return file;
        } else {
          return {
            ...file,
            meta: {
              ...file.meta,
              status: 'uploading',
            },
          };
        }
      });
    }
    default:
      return files;
  }
}

// NOTE: Gives us the current state without invalidating too often and
// let us do side effects
// https://github.com/facebook/react/issues/14099#issuecomment-440013892
// but have in mind: https://github.com/facebook/react/issues/14092#issuecomment-435907249
function useEventCallback(fn) {
  let ref = React.useRef();
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  return React.useCallback((...args) => (0, ref.current)(...args), []);
}

export default useXhr;
