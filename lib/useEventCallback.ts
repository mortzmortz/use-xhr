import * as React from 'react';

type Fn<ARGS extends any[], R> = (...args: ARGS) => R;

const useEventCallback = <A extends any[], R>(fn: Fn<A, R>): Fn<A, R> => {
  let ref = React.useRef<Fn<A, R>>(fn);
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  return React.useMemo(
    () =>
      (...args: A): R => {
        const { current } = ref;
        return current(...args);
      },
    []
  );
};

export default useEventCallback;
