'use client';

import type { ReactNode } from 'react';

/**
 * Keeps destructive server actions as real forms while adding an explicit
 * browser confirmation and a server-verifiable confirmation value.
 */
export default function ConfirmActionForm({
  action,
  confirmMessage,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input type="hidden" name="confirmation" value="delete" />
      {children}
    </form>
  );
}
