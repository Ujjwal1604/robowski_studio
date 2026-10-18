import { useEffect, useRef } from 'react';
import { mountRobowski } from '@/ui/robowskiUI';

function App() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) {
      mountRobowski(rootRef.current);
    }
  }, []);

  return <div ref={rootRef} className="robowski-root" />;
}

export default App;
