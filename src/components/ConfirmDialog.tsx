// src/components/ConfirmDialog.tsx
import React from "react";

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onClose: (confirmed: boolean) => void;
};

export default function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmText = "Yes",
  cancelText = "No",
  onClose,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-2xl bg-white p-5 w-[min(92vw,480px)] shadow-lg">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm opacity-80 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            className="px-3 py-2 rounded-xl bg-gray-200 hover:bg-gray-300"
            onClick={() => onClose(false)}
          >
            {cancelText}
          </button>
          <button
            className="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
            onClick={() => onClose(true)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
