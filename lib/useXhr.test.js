import { useXhr } from './useXhr';
import { renderHook } from '@testing-library/react-hooks';

describe('useXhr API', () => {
  it('returns the expected object', () => {
    const { result } = renderHook(() => useXhr());

    expect(result.current).toEqual({
      files: [],
      rejectedFiles: [],
      extra: {
        accept: '*',
        maxFiles: Number.MAX_SAFE_INTEGER,
        maxSizeBytes: Number.MAX_SAFE_INTEGER,
        minSizeBytes: 0,
        multiple: true,
      },
      getRootProps: expect.any(Function),
      getInputProps: expect.any(Function),
      isDragActive: false,
      isDragAccept: false,
      isDragReject: false,
      isFocus: false,
      inputRef: expect.any(Object),
      uploadAll: expect.any(Function),
    });
  });
});
