<h1 align="center">
  use-xhr
</h1>

<details>
<summary>📖 Table of Contents</summary>
<p>

- [Getting Started](#getting-started)
- [Examples](#examples)
  - [Basic Usage](#basic-usage)
- [API](#api)
  - [Props and Methods](#props-and-methods)
    - [`accept: String`](#accept-string)
    - [`autoUpload: Boolean`](#autoupload-boolean)
    - [`chunks: Boolean`](#chunks-boolean)
    - [`chunkSize: Number`](#chunksize-number)
    - [`disabled: Boolean`](#disabled-boolean)
    - [`getChunkName: Function`](#getchunkname-function)
    - [`getFilesFromEvent: Function`](#getfilesfromevent-function)
    - [`getUploadParams: Function`](#getuploadparams-function)
    - [`maxFiles: Number`](#maxfiles-number)
    - [`maxSizeBytes: Number`](#maxsizebytes-number)
    - [`minFiles: Number`](#minfiles-number)
    - [`mainizeBytes: Number`](#mainizebytes-number)
    - [`multiple: Boolean`](#multiple-boolean)
    - [`noClick: Boolean`](#noclick-boolean)
    - [`timeout: Number`](#timeout-number)
    - [`validate: Function`](#validate-function)
- [The `files`object](#the-filesobject)
- [License](#license)

</p>
</details>

## Getting Started

To get it started, add `use-xhr` to your project:

```
npm install --save use-xhr
```

Please note that `use-xhr` requires `react@^16.8.0` as a peer dependency.

## Examples

### Basic Usage

```jsx
import useXhr from 'useXhr';

function Upload({ url }) {
  const {
    getRootProps,
    getInputProps,
    isDragActive
  } = useXhr({
    getUploadParams: { url }
  });

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} />
      {
        isDragActive ?
          <p>Drop the files here ...</p> :
          <p>Drag 'n' drop some files here, or click to select files</p>
      }
    </div>
  );
}
```

## API
And their default values.

```js
import useXhr from 'useXhr';

function Upload() {
  const {
    files,
    extra: {
      accept,
      multiple,
      minSizeBytes,
      maxSizeBytes,
      maxFiles,
    },
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    isFocus,
    inputRef,
  } = useXhr(
    {
      accept = '*',
      autoUpload = true,
      chunks = false,
      chunks = false,
      chunkSize = 512 * 1024,
      disabled = false,
      getChunkName = noop,
      getFilesFromEvent,
      getUploadParams = noop,
      maxFiles = Number.MAX_SAFE_INTEGER,
      maxSizeBytes = Number.MAX_SAFE_INTEGER,
      minSizeBytes = 0,
      multiple = true,
      noClick = false,
      timeout = 0,
      validate = noop,
    }
  );

  return (
    // ...
  )
}
```

### Props and Methods

#### `accept: String`
  Set accepted file types. See https://github.com/okonet/attr-accept for more information. Keep in mind that mime type determination is not reliable across platforms.

#### `autoUpload: Boolean`
  If set to **true**, files will be uploaded instantly after adding them. Otherwise you can trigger an upload manually by firing the `restart` method on the `file`object.

#### `chunks: Boolean`
  If set to **true** uploaded files will be split into chunks.

#### `chunkSize: Number`
  Size of single chunk (in bytes).

#### `disabled: Boolean`
  Enable/disable upload.

#### `getChunkName: Function`
  **Argumens**: fileWithMeta, chunkIndex

  Use this to provide a custom name for each chunk.

#### `getFilesFromEvent: Function`
  **Argumens**: event

  Use this to provide a custom file aggregator.

#### `getUploadParams: Function`
  **Argumens**: fileWithMeta

  A callback that receives a `fileWithMeta` object and returns the params needed to upload the file.This prop is **required** to initiate `useXhr`.

  It should return an object with `{ url (string), method (string), body, fields (object), headers (object), meta (object) }`.

  The only required key is `url`. `POST` is the default method.

  If you pass your own request `body`, `useXhr` uploads it using `xhr.send`.

#### `maxFiles: Number`
  Maximum of files.

#### `maxSizeBytes: Number`
  Maximum file size (in bytes).

#### `minFiles: Number`
  Minimum of files,

#### `mainizeBytes: Number`
  Minimum file size (in bytes).

#### `multiple: Boolean`
  Allow uploading (or selection from the file dialog) of multiple files.

#### `noClick: Boolean`
  If true, disables click to open the native file selection dialog.

#### `timeout: Number`
  A time in milliseconds. If the request does not succeed within the given time, it gets canceled. A falsy value will skip a timeout.

#### `validate: Function`
  **Argumens**: fileWithMeta

  A callback that receives a `fileWithMeta` object. If you return a falsy value from `validate`, the file is accepted, else it's rejected.

## The `files`object

The `files` object provides information about the current uploads and methods to `cancel`, `restart` or `remove` files.

```js
[
    {
        meta: {
            name, // Filename
            size, // Filesize in bytes
            type, // Filetype
            lastModifiedDate,
            uploadedDate,
            progress, // Upload progress in percent
            id, // Unique file id
            estimated, // Estimated time until upload is finished
            status, // Current upload status
            previewUrl,
            width,
            height,
        },
        cancel, // A method to cancel upload
        restart, // A method to restart upload
        remove, // A method to remove file from upload list
    }
]
```

## License

MIT
