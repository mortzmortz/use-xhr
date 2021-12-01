import * as React from 'react';
import { v1 as uuidv1 } from 'uuid';
import {
  FileWithPath,
  fromEvent as defaultGetFilesFromEvent,
} from 'file-selector';
import {
  allFilesAccepted,
  fileAccepted,
  fileMatchSize,
  getEstimatedSeconds,
  isIeOrEdge,
  notEmpty,
  TOO_MANY_FILES_REJECTION,
} from './utils';
import useEventCallback from './useEventCallback';

// TODO: add onFileUploaded callback for chunk upload
// FEATURE?: run in web worker
// FEATURE: add min image dimensions feature
// FEATURE: add resume function

type StatusValue =
  | 'rejected_file_type'
  | 'rejected_max_files'
  | 'preparing'
  | 'error_file_size'
  | 'error_validation'
  | 'ready'
  | 'started'
  | 'getting_upload_params'
  | 'error_upload_params'
  | 'uploading'
  | 'exception_upload'
  | 'aborted'
  | 'restarted'
  | 'removed'
  | 'error_upload'
  | 'headers_received'
  | 'done';

type MethodValue =
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'DELETE'
  | 'GET'
  | 'HEAD'
  | 'OPTIONS'
  | 'PATCH'
  | 'POST'
  | 'PUT';

interface RootProps extends React.HTMLAttributes<HTMLElement> {
  refKey?: string;
  [key: string]: any;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  refKey?: string;
}

type UseXhrProps = {
  accept?: string;
  multiple?: boolean;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  maxFiles?: number;
  autoUpload?: boolean;
  timeout?: number;
  chunkSize?: boolean | number;
  noClick?: boolean;
  disabled?: boolean;
  chunks?: boolean;
  getUploadParams: (file?: FileWithMeta) => UploadParams;
  getChunkName?: (file: File, chunkIndex: number) => string;
  getFilesFromEvent?: typeof defaultGetFilesFromEvent;
  getDataTransferItemsFromEvent?: typeof defaultGetFilesFromEvent;
  validate?: (
    file: FileWithPath | DataTransferItem
  ) => FileError | FileError[] | null;
  onFileUploaded?(successFile: FileWithMeta, allFiles: FileWithMeta[]): void;
};

type UploadParams = {
  url: string;
  method?: MethodValue;
  body?: string | FormData | ArrayBuffer | Blob | File | URLSearchParams;
  fields?: { [name: string]: string | Blob };
  headers?: { [name: string]: string };
};

interface Meta {
  name: string;
  size: number; // bytes
  type: string; // MIME type, example: `image/*`
  lastModifiedDate: string; // ISO string
  uploadedDate: string; // ISO string
  progress: number;
  id: string;
  status: StatusValue;
  chunkProgress: (number | 'done')[];
  estimated: number;
  previewUrl?: string; // from URL.createObjectURL
  width?: number;
  height?: number;
  duration?: number; // seconds
  videoWidth?: number;
  videoHeight?: number;
  validationError?: Error;
}

type FileObject = {
  meta: Meta;
  cancel: () => void;
  restart: () => void;
  remove: () => void;
};

interface FileWithMeta extends FileObject {
  file: FileWithPath;
}

enum ErrorCode {
  FileInvalidType = 'file-invalid-type',
  FileTooLarge = 'file-too-large',
  FileTooSmall = 'file-too-small',
  TooManyFiles = 'too-many-files',
}

export interface FileError {
  message: string;
  code: ErrorCode | string;
}

interface FileRejection {
  file: FileWithPath | DataTransferItem;
  errors: FileError[];
}

const useXhr = (
  {
    getUploadParams,
    getChunkName,
    minSizeBytes = 0,
    maxSizeBytes = Number.MAX_SAFE_INTEGER,
    maxFiles = Number.MAX_SAFE_INTEGER,
    accept = '*',
    autoUpload = true,
    validate,
    timeout,
    noClick = false,
    multiple = true,
    disabled = false,
    chunks = false,
    chunkSize = false,
    getFilesFromEvent = defaultGetFilesFromEvent,
    getDataTransferItemsFromEvent = defaultGetFilesFromEvent,
    onFileUploaded = () => {},
  } = {} as UseXhrProps
) => {
  const xhrs = React.useRef<XMLHttpRequest[]>([]);
  const mountedRef = React.useRef<boolean>(true);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeDragRef = React.useRef(0);
  const draggedRef = React.useRef<(FileWithPath | DataTransferItem)[]>([]);
  const rootRef = React.useRef<HTMLElement>(null);
  const [isDragActive, setIsDragActive] = React.useState(false);
  const [isFocus, setIsFocus] = React.useState(false);
  const [rejectedFiles, setRejectedFiles] = React.useState<FileRejection[]>([]);
  const [files, dispatch] = React.useReducer(fileReducer, []);

  const handleUploadError = ({ status }, id) => {
    let statusText = 'failure_unknown';
    switch (status) {
      case 404:
        console.error('File not found');
        statusText = 'failure_file-not-found';
        break;
      case 500:
        console.error('Server error');
        statusText = 'failure_server-not-found';
        break;
      case 0:
        console.error('Request aborted');
        statusText = 'failure_aborted';
        break;
      default:
        console.error('Unknown error ' + status);
    }
    dispatch({
      type: 'setStatus',
      payload: { id, status: statusText },
    });
  };

  function handleResponse({ response, status }, id) {
    if (status === 201) {
      dispatch({
        type: 'setStatus',
        payload: { id, status: 'done' },
      });
      return;
    }
    const responseObj = JSON.parse(response);
    dispatch({
      type: 'setStatus',
      payload: { id, status: responseObj.message },
    });
  }

  const updateFileProgress = useEventCallback(
    (fileWithMeta: FileWithMeta, progress: number, status: string) => {
      const fileToUpdate = files.filter(
        file => file.meta.id === fileWithMeta.meta.id
      )[0];
      if (status === 'uploading') {
        dispatch({
          type: 'setProgress',
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
    }
  );

  const updateFileChunkProgress = useEventCallback(
    ({
      file,
      chunkIndex,
      chunkProgress,
      status,
    }: {
      file: FileWithMeta;
      chunkIndex: number;
      chunkProgress: number;
      status: string;
    }) => {
      const { id } = file.meta;
      const fileToUpdate = files.filter(file => file.meta.id === id)[0];
      const newChunkProgress = [...fileToUpdate.meta.chunkProgress];
      const summedProgresses = newChunkProgress.reduce(
        (a, b) =>
          (typeof a === 'number' ? a : 100) + (typeof b === 'number' ? b : 100),
        0
      ) as number;
      const totalProgress = summedProgresses / newChunkProgress.length;
      newChunkProgress[chunkIndex] = status === 'done' ? 'done' : chunkProgress;

      // Update Progress
      dispatch({
        type: 'setProgress',
        payload: {
          id,
          progress: totalProgress,
          chunkProgress: newChunkProgress,
          estimated: getEstimatedSeconds(file.meta.uploadedDate, totalProgress),
        },
      });
    }
  );

  const handleUploadSuccess = React.useCallback(
    (file: FileWithMeta) => {
      onFileUploaded(file, files);
    },
    [onFileUploaded, files]
  );

  // TODO: compare uploadFile and uploadChunk
  // => a lot of duplicate code
  const uploadFile = React.useCallback(
    ({
      file,
      progressCallback,
    }: {
      file: FileWithMeta;
      progressCallback: (progress: any, status: any) => void;
    }) => {
      const fileToUpload = file;
      if (!getUploadParams) return;

      let params: UploadParams | null = null;
      try {
        params = getUploadParams(fileToUpload);
      } catch (e: any) {
        console.error('Error Upload Params', e.stack);
      }

      if (params === null || params.url === null) return;

      const { url, method = 'POST', body, fields = {}, headers = {} } = params;
      const { id, name, size } = fileToUpload.meta;

      if (!url) {
        dispatch({
          type: 'setStatus',
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
      xhr.setRequestHeader('X-Content-Name', name);
      xhr.setRequestHeader('X-Content-Length', size.toString());
      xhr.setRequestHeader('X-Content-Id', id);
      xhr.setRequestHeader('X-Chunk-Length', size.toString());
      xhr.setRequestHeader('X-Chunk-Id', '0');

      for (const header of Object.keys(headers)) {
        xhr.setRequestHeader(header, headers[header]);
      }

      xhr.onload = () => {
        progressCallback(100, 'done');
        delete xhrs.current[id];
        handleUploadSuccess(file);
      };
      xhr.onerror = () => handleUploadError(xhr, id);
      xhr.onreadystatechange = () =>
        xhr.readyState === 4 && handleResponse(xhr, id);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          progressCallback((event.loaded / event.total) * 100, 'uploading');
        }
      };

      formData.append('chunk', fileToUpload.file);
      if (timeout) xhr.timeout = timeout;
      xhr.send(body || formData);

      xhrs.current[id] = xhr;

      dispatch({
        type: 'setStatus',
        payload: { id, status: 'uploading' },
      });
    },
    [getUploadParams, handleUploadSuccess, timeout]
  );

  const uploadChunk = React.useCallback(
    (chunk, chunkIndex, file, progressCallback) => {
      if (chunk) {
        const fileToUpload = file;
        if (!getUploadParams) return;

        let params: UploadParams | null = null;
        try {
          params = getUploadParams(fileToUpload);
        } catch (e: any) {
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
        xhr.onerror = () => handleUploadError(xhr, id);
        xhr.onreadystatechange = () =>
          xhr.readyState === 4 && handleResponse(xhr, id);
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

        xhrs.current[`${file.meta.id}-${chunkId}`] = xhr;

        dispatch({
          type: 'setStatus',
          payload: { id: file.meta.id, status: 'uploading' },
        });
      }
    },
    [getChunkName, getUploadParams, timeout]
  );

  const upload = React.useCallback(
    (file: FileWithMeta) => {
      if (chunks) {
        if (typeof chunkSize === 'number' && chunkSize !== 0) {
          const BYTES_PER_CHUNK = chunkSize;
          const SIZE = file.meta.size;

          let start = 0;
          let end = BYTES_PER_CHUNK;

          let chunkIndex = 0;
          while (start < SIZE) {
            uploadChunk(
              file.file.slice(start, end),
              chunkIndex,
              file,
              (percentage, chunkIndex, status) =>
                updateFileChunkProgress({
                  file,
                  chunkIndex,
                  chunkProgress: percentage,
                  status,
                })
            );
            chunkIndex += 1;
            start = end;
            end = start + BYTES_PER_CHUNK;
          }
        } else {
          console.log(
            `'chunkSize' has to be a positive number. You provided ${chunkSize}.`
          );
        }
      } else {
        uploadFile({
          file,
          progressCallback: (progress, status) =>
            updateFileProgress(file, progress, status),
        });
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

  const getFileById = (id: string) =>
    files.filter(file => file.meta.id === id)[0];

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
        type: 'cancelUpload',
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
        type: 'removeById',
        payload: id,
      });
    }
  });

  const uploadAll = React.useCallback(() => {
    if (!files.length) return;
    files.forEach(restart);
  }, [files, restart]);

  const handleFile = React.useCallback(
    async (file, id) => {
      const { name, size, type, lastModified } = file;
      const uploadedDate = new Date().toISOString();
      const lastModifiedDate =
        lastModified && new Date(lastModified).toISOString();
      let chunkProgress: number[];

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
          percent: 0,
          progress: 0,
          estimated: 0,
          chunkProgress: [],
          id,
          status: 'preparing',
        },
        cancel: () => {},
        remove: () => {},
        restart: () => {},
      } as FileWithMeta;

      fileWithMeta.meta.status = autoUpload ? 'getting_upload_params' : 'ready';

      fileWithMeta.cancel = () => cancel(fileWithMeta);
      fileWithMeta.remove = () => remove(fileWithMeta);
      fileWithMeta.restart = () => restart(fileWithMeta);

      const fileWithMetaAndPreview = await generatePreview(fileWithMeta);

      dispatch({ type: 'add', payload: fileWithMetaAndPreview });
      if (autoUpload) {
        upload(fileWithMetaAndPreview);
      }
    },
    [chunkSize, autoUpload, cancel, remove, restart, upload]
  );

  const handleFiles = React.useCallback(
    (addedFiles: (FileWithPath | DataTransferItem)[]) => {
      setRejectedFiles([]);
      const acceptedFiles: (FileWithPath | DataTransferItem)[] = [];
      const fileRejections: FileRejection[] = [];

      addedFiles.forEach(file => {
        const [accepted, acceptError] = fileAccepted(file, accept);
        const [sizeMatch, sizeError] = fileMatchSize(
          file,
          minSizeBytes,
          maxSizeBytes
        );
        const customErrors = validate ? validate(file) : null;

        if (accepted && sizeMatch && !customErrors) {
          acceptedFiles.push(file);
        } else {
          let errors = [acceptError, sizeError];

          if (customErrors) {
            errors = errors.concat(customErrors);
          }

          fileRejections.push({ file, errors: errors.filter(notEmpty) });
        }

        if (
          (!multiple && acceptedFiles.length > 1) ||
          (multiple && maxFiles >= 1 && acceptedFiles.length > maxFiles) ||
          // if autoUpload is disabled, we want to check the length of all files in the queue
          (!autoUpload && files.length + acceptedFiles.length > maxFiles)
        ) {
          // Reject everything and empty accepted files
          acceptedFiles.forEach(file => {
            fileRejections.push({ file, errors: [TOO_MANY_FILES_REJECTION] });
          });
          acceptedFiles.splice(0);
        }
      });

      acceptedFiles.forEach(file => handleFile(file, uuidv1()));
      setRejectedFiles(fileRejections);
    },
    [
      autoUpload,
      files,
      accept,
      handleFile,
      maxFiles,
      maxSizeBytes,
      minSizeBytes,
      multiple,
      validate,
    ]
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
    // In IE11/Edge the file-browser dialog is blocking, therefore, use setTimeout()
    if (isIeOrEdge()) {
      setTimeout(openFileDialog, 0);
    } else {
      openFileDialog();
    }
  }, [noClick]);

  const onKeyDown = React.useCallback(
    (event: React.BaseSyntheticEvent<KeyboardEvent, HTMLDivElement>) => {
      // Ignore keyboard events bubbling up the DOM tree
      if (!rootRef.current || !rootRef.current.isEqualNode(event.target))
        return;

      // Open file dialog with 'space' and 'enter' keys
      if (event.nativeEvent.key === ' ' || event.nativeEvent.key === 'Enter') {
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
    const preview: any = {};
    const isImage = type.startsWith('image/');
    const isAudio = type.startsWith('audio/');
    const isVideo = type.startsWith('video/');
    const isApplication = type.startsWith('application/');
    const isText = type.startsWith('text/');

    if (!isImage && !isAudio && !isVideo && !isApplication && !isText) return;

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

  const fileCount = draggedRef.current.length;
  const isDragAccept =
    fileCount > 0 &&
    allFilesAccepted({
      files: draggedRef.current,
      accept,
      minSize: minSizeBytes,
      maxSize: maxSizeBytes,
      multiple,
      maxFiles,
    });
  const isDragReject = fileCount > 0 && !isDragAccept;

  const extra = {
    accept,
    multiple,
    minSizeBytes,
    maxSizeBytes,
    maxFiles,
  };

  const getRootProps = React.useMemo(
    () =>
      ({ refKey = 'ref', ...rest }: RootProps = {}) => ({
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
    () =>
      ({ refKey = 'ref', onChange, ...rest }: InputProps = {}) => ({
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
    rejectedFiles,
    extra,
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
    isFocus,
    inputRef,
    uploadAll,
  };
};

interface Action {
  type: string;
  payload: any;
}

function fileReducer(files: FileWithMeta[], action: Action): FileWithMeta[] {
  switch (action.type) {
    case 'add': {
      return [...files, action.payload];
    }
    case 'removeById': {
      return files.filter(file => file.meta.id !== action.payload);
    }
    case 'reset': {
      return [];
    }
    case 'cancelUpload': {
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
    case 'setStatus': {
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
    case 'setProgress': {
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
    default:
      return files;
  }
}

export { ErrorCode } from './utils';
export { useXhr };
