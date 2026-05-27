import React, { Suspense, lazy, useEffect, useState, type ComponentProps } from "react";
import { RefreshCw } from "lucide-react";

type ReaderViewProps = ComponentProps<
  Awaited<typeof import("./ReaderView")>["default"]
>;

let readerChunkPromise: Promise<typeof import("./ReaderView")> | null = null;

export function preloadReaderView(): void {
  loadReaderViewModule();
}

function loadReaderViewModule() {
  if (!readerChunkPromise) {
    readerChunkPromise = import("./ReaderView");
  }
  return readerChunkPromise;
}

function ReaderViewLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-app-text">Không mở được Phòng Đọc</p>
      <p className="text-xs text-app-text-muted leading-relaxed max-w-sm">
        Có thể thiếu file JS sau build. Hãy build lại web và{" "}
        <span className="font-mono">cap sync android</span> trước khi đóng APK.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-10 px-4 text-sm font-medium rounded-md bg-app-accent text-white"
      >
        Thử lại
      </button>
    </div>
  );
}

const LazyReaderView = lazy(() =>
  loadReaderViewModule()
    .then((mod) => ({ default: mod.default }))
    .catch((err) => {
      console.error("ReaderView chunk failed", err);
      return {
        default: function ReaderViewChunkError(props: ReaderViewProps) {
          void props;
          return (
            <ReaderViewLoadFailed
              onRetry={() => {
                readerChunkPromise = null;
                window.location.reload();
              }}
            />
          );
        },
      };
    })
);

function ReaderViewLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8">
      <RefreshCw className="w-7 h-7 text-amber-500 animate-spin" />
      <p className="text-xs text-app-text-muted">Đang tải Phòng Đọc…</p>
      {slow && (
        <p className="text-xs text-amber-700 dark:text-amber-400 text-center max-w-xs leading-relaxed">
          Nếu chờ quá lâu: thoát app, chạy lại{" "}
          <span className="font-mono">npm run build</span> rồi{" "}
          <span className="font-mono">npx cap sync android</span> từ thư mục gốc repo trước khi build APK.
        </p>
      )}
    </div>
  );
}

export default function ReaderViewGate(props: ReaderViewProps) {
  return (
    <Suspense fallback={<ReaderViewLoading />}>
      <LazyReaderView {...props} />
    </Suspense>
  );
}
